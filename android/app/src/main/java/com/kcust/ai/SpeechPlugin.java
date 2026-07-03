package com.kcust.ai;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.iflytek.sparkchain.core.SparkChain;
import com.iflytek.sparkchain.core.SparkChainConfig;
import com.iflytek.sparkchain.core.asr.ASR;
import com.iflytek.sparkchain.core.asr.AsrCallbacks;
import com.iflytek.sparkchain.core.asr.AudioAttributes;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(
    name = "Speech",
    permissions = @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = SpeechPlugin.SPEECH_PERMISSION)
)
public class SpeechPlugin extends Plugin {
    static final String SPEECH_PERMISSION = "speech";
    private static final String TAG = "KCustSpeech";
    private static final int SAMPLE_RATE = 16000;
    private static final int LISTEN_TIMEOUT_MS = 20000;

    private boolean sparkChainInitialized = false;
    private ASR activeAsr = null;
    private AudioRecord activeRecorder = null;
    private Thread activeRecordThread = null;
    private final AtomicBoolean isRecording = new AtomicBoolean(false);
    private PluginCall activeIflytekCall = null;
    private PluginCall activeStopCall = null;
    private boolean systemFallbackPending = false;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", isIflytekConfigured() || SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState(SPEECH_PERMISSION) == PermissionState.GRANTED) {
            resolvePermission(call);
            return;
        }

        requestPermissionForAlias(SPEECH_PERMISSION, call, "permissionCallback");
    }

    @PluginMethod
    public void listenOnce(PluginCall call) {
        String preferredProvider = call.getString("preferredProvider", "");
        if ("iflytek".equals(preferredProvider) && isIflytekConfigured()) {
            listenWithIflytek(call);
            return;
        }

        listenWithSystemRecognizer(call);
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        String preferredProvider = call.getString("preferredProvider", "");
        if (!"iflytek".equals(preferredProvider) || !isIflytekConfigured()) {
            systemFallbackPending = true;
            resolveStarted(call, "system");
            return;
        }

        if (activeAsr != null || activeIflytekCall != null || activeStopCall != null) {
            call.reject("Speech recognition is already running", "SPEECH_BUSY");
            return;
        }

        if (getPermissionState(SPEECH_PERMISSION) != PermissionState.GRANTED) {
            call.reject("Microphone permission is not granted", "PERMISSION_DENIED");
            return;
        }

        if (!ensureSparkChainInitialized() || !startIflytekSession()) {
            systemFallbackPending = true;
            resolveStarted(call, "system");
            return;
        }

        resolveStarted(call, "iflytek");
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        if (systemFallbackPending) {
            systemFallbackPending = false;
            listenWithSystemRecognizer(call);
            return;
        }

        if (activeAsr == null) {
            JSObject response = new JSObject();
            response.put("text", "");
            response.put("provider", "iflytek");
            call.resolve(response);
            return;
        }

        activeStopCall = call;
        stopRecorderOnly();
        activeAsr.stop(false);
        getBridge().getActivity().getWindow().getDecorView().postDelayed(() -> {
            if (activeStopCall == null) return;

            PluginCall pendingCall = activeStopCall;
            cleanupIflytekSession(true);
            JSObject response = new JSObject();
            response.put("text", "");
            response.put("provider", "iflytek");
            pendingCall.resolve(response);
        }, 5000);
    }

    @PluginMethod
    public void cancelListening(PluginCall call) {
        systemFallbackPending = false;
        cleanupIflytekSession(true);
        JSObject response = new JSObject();
        response.put("cancelled", true);
        call.resolve(response);
    }

    private void listenWithSystemRecognizer(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.unavailable("Speech recognition is not available on this device");
            return;
        }

        if (getPermissionState(SPEECH_PERMISSION) != PermissionState.GRANTED) {
            call.reject("Microphone permission is not granted", "PERMISSION_DENIED");
            return;
        }

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.CHINA.toLanguageTag());
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "请说出客户指令");
        startActivityForResult(call, intent, "listenCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        resolvePermission(call);
    }

    @ActivityCallback
    private void listenCallback(PluginCall call, ActivityResult result) {
        JSObject response = new JSObject();
        String text = "";

        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> matches = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (matches != null && !matches.isEmpty()) {
                text = matches.get(0);
            }
        }

        response.put("text", text);
        response.put("provider", "system");
        call.resolve(response);
    }

    private void resolvePermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("status", getPermissionState(SPEECH_PERMISSION) == PermissionState.GRANTED ? "granted" : "denied");
        call.resolve(result);
    }

    private void listenWithIflytek(PluginCall call) {
        if (activeIflytekCall != null) {
            call.reject("Speech recognition is already running", "SPEECH_BUSY");
            return;
        }

        if (getPermissionState(SPEECH_PERMISSION) != PermissionState.GRANTED) {
            call.reject("Microphone permission is not granted", "PERMISSION_DENIED");
            return;
        }

        if (!ensureSparkChainInitialized()) {
            listenWithSystemRecognizer(call);
            return;
        }

        activeIflytekCall = call;
        if (!startIflytekSession()) {
            activeIflytekCall = null;
            listenWithSystemRecognizer(call);
            return;
        }
        getBridge().getActivity().getWindow().getDecorView().postDelayed(() -> {
            PluginCall pendingCall = activeIflytekCall;
            if (pendingCall == null) return;

            cleanupIflytekSession(false);
            listenWithSystemRecognizer(pendingCall);
        }, LISTEN_TIMEOUT_MS);
    }

    private boolean startIflytekSession() {
        activeAsr = new ASR("zh_cn", "slm", "mandarin");
        activeAsr.ptt(true);
        activeAsr.nunum(true);
        activeAsr.vadEos(1600);
        activeAsr.dwa("wpgs");
        activeAsr.registerCallbacks(createIflytekCallbacks());

        AudioAttributes audioAttributes = new AudioAttributes();
        audioAttributes.setSampleRate(SAMPLE_RATE);
        audioAttributes.setEncoding("raw");
        audioAttributes.setChannels(1);
        audioAttributes.setBitdepth(16);

        int ret = activeAsr.start(audioAttributes, null);
        if (ret != 0) {
            Log.w(TAG, "iFlytek ASR start failed: " + ret);
            cleanupIflytekSession(true);
            return false;
        }

        startIflytekRecorder();
        return true;
    }

    private boolean ensureSparkChainInitialized() {
        if (sparkChainInitialized) return true;

        try {
            SparkChainConfig config = SparkChainConfig.builder()
                .appID(BuildConfig.IFLYTEK_APP_ID)
                .apiKey(BuildConfig.IFLYTEK_API_KEY)
                .apiSecret(BuildConfig.IFLYTEK_API_SECRET);
            int ret = SparkChain.getInst().init(getContext().getApplicationContext(), config);
            sparkChainInitialized = ret == 0;
            if (!sparkChainInitialized) {
                Log.w(TAG, "SparkChain init failed: " + ret);
            }
            return sparkChainInitialized;
        } catch (Exception exception) {
            Log.w(TAG, "SparkChain init exception", exception);
            return false;
        }
    }

    private AsrCallbacks createIflytekCallbacks() {
        return new AsrCallbacks() {
            @Override
            public void onResult(ASR.ASRResult asrResult, Object usrContext) {
                if (asrResult == null) return;

                String text = asrResult.getBestMatchText();
                if (asrResult.getStatus() == 2) {
                    resolveIflytekText(text == null ? "" : text);
                }
            }

            @Override
            public void onError(ASR.ASRError asrError, Object usrContext) {
                int code = asrError == null ? -1 : asrError.getCode();
                Log.w(TAG, "iFlytek ASR error: " + code);
                PluginCall pendingCall = activeIflytekCall;
                cleanupIflytekSession(true);
                if (pendingCall != null) {
                    listenWithSystemRecognizer(pendingCall);
                }
            }
        };
    }

    private void startIflytekRecorder() {
        int minBufferSize = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        );
        int bufferSize = Math.max(minBufferSize, 1280);

        activeRecorder = new AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize
        );

        isRecording.set(true);
        activeRecordThread = new Thread(() -> {
            byte[] buffer = new byte[bufferSize];
            try {
                activeRecorder.startRecording();
                while (isRecording.get() && activeRecorder != null && activeAsr != null) {
                    int bytesRead = activeRecorder.read(buffer, 0, buffer.length);
                    if (bytesRead > 0) {
                        int ret = activeAsr.write(Arrays.copyOf(buffer, bytesRead));
                        if (ret != 0) {
                            Log.w(TAG, "iFlytek ASR write failed: " + ret);
                            break;
                        }
                    }
                }
            } catch (Exception exception) {
                Log.w(TAG, "iFlytek recorder exception", exception);
            }
        }, "KCustIflytekRecorder");
        activeRecordThread.start();
    }

    private void resolveIflytekText(String text) {
        PluginCall pendingCall = activeStopCall != null ? activeStopCall : activeIflytekCall;
        cleanupIflytekSession(false);
        if (pendingCall == null) return;

        JSObject response = new JSObject();
        response.put("text", text);
        response.put("provider", "iflytek");
        pendingCall.resolve(response);
    }

    private void cleanupIflytekSession(boolean cancelAsr) {
        activeIflytekCall = null;
        activeStopCall = null;
        stopRecorderOnly();

        if (activeAsr != null) {
            try {
                activeAsr.stop(cancelAsr);
            } catch (Exception exception) {
                Log.w(TAG, "iFlytek ASR cleanup exception", exception);
            }
            activeAsr = null;
        }
        activeRecordThread = null;
    }

    private void stopRecorderOnly() {
        isRecording.set(false);

        if (activeRecorder != null) {
            try {
                if (activeRecorder.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    activeRecorder.stop();
                }
                activeRecorder.release();
            } catch (Exception exception) {
                Log.w(TAG, "iFlytek recorder cleanup exception", exception);
            }
            activeRecorder = null;
        }
    }

    private void resolveStarted(PluginCall call, String provider) {
        JSObject response = new JSObject();
        response.put("provider", provider);
        call.resolve(response);
    }

    private boolean isIflytekConfigured() {
        return !BuildConfig.IFLYTEK_APP_ID.trim().isEmpty()
            && !BuildConfig.IFLYTEK_API_KEY.trim().isEmpty()
            && !BuildConfig.IFLYTEK_API_SECRET.trim().isEmpty();
    }

    @Override
    protected void handleOnDestroy() {
        cleanupIflytekSession(true);
        if (sparkChainInitialized) {
            SparkChain.getInst().unInit();
            sparkChainInitialized = false;
        }
        super.handleOnDestroy();
    }
}
