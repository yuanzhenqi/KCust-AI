package com.kcust.ai;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureKeys")
public class SecureKeysPlugin extends Plugin {
    private static final String KEY_ALIAS = "kcust_model_api_key";
    private static final String STORE_NAME = "kcust_secure_keys";
    private static final String VALUE_KEY = "model_api_key_ciphertext";
    private static final String IV_KEY = "model_api_key_iv";

    @PluginMethod
    public void saveModelApiKey(PluginCall call) {
        String apiKey = call.getString("apiKey", "");

        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());

            byte[] encrypted = cipher.doFinal(apiKey.getBytes(StandardCharsets.UTF_8));
            preferences()
                .edit()
                .putString(VALUE_KEY, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(IV_KEY, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .apply();

            JSObject result = new JSObject();
            result.put("saved", true);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Failed to save model API key", "KEYSTORE_SAVE_FAILED", exception);
        }
    }

    @PluginMethod
    public void getModelApiKey(PluginCall call) {
        String ciphertext = preferences().getString(VALUE_KEY, "");
        String iv = preferences().getString(IV_KEY, "");

        if (ciphertext == null || ciphertext.isEmpty() || iv == null || iv.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("apiKey", "");
            call.resolve(empty);
            return;
        }

        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                Cipher.DECRYPT_MODE,
                getOrCreateKey(),
                new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
            );

            byte[] decrypted = cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP));
            JSObject result = new JSObject();
            result.put("apiKey", new String(decrypted, StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Failed to load model API key", "KEYSTORE_LOAD_FAILED", exception);
        }
    }

    @PluginMethod
    public void deleteModelApiKey(PluginCall call) {
        preferences().edit().remove(VALUE_KEY).remove(IV_KEY).apply();

        JSObject result = new JSObject();
        result.put("deleted", true);
        call.resolve(result);
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE);
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);

        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }

        KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        keyGenerator.init(
            new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build()
        );
        return keyGenerator.generateKey();
    }
}
