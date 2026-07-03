package com.kcust.ai;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "Overlay")
public class OverlayPlugin extends Plugin {
    private static String pendingCommand = "";
    private static String pendingAction = "";

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("status", hasOverlayPermission() ? "granted" : "denied");
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (hasOverlayPermission()) {
            resolvePermission(call, "granted");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }

        resolvePermission(call, hasOverlayPermission() ? "granted" : "denied");
    }

    @PluginMethod
    public void start(PluginCall call) {
        JSObject result = new JSObject();
        if (!hasOverlayPermission()) {
            result.put("status", "permission-denied");
            call.resolve(result);
            return;
        }

        JSObject config = call.getObject("config", new JSObject());
        Intent intent = new Intent(getContext(), FloatingAssistantService.class);
        intent.putExtra("todos", serializeTodos(call.getArray("todos")));
        intent.putExtra("dockSide", config.optString("dockSide", "auto"));
        intent.putExtra("overlaySize", config.optString("size", "medium"));
        intent.putExtra("overlayOpacity", config.optDouble("opacity", 1.0));
        getContext().startService(intent);
        result.put("status", "started");
        call.resolve(result);
    }

    @PluginMethod
    public void updateStatus(PluginCall call) {
        Intent intent = new Intent(getContext(), FloatingAssistantService.class);
        intent.putExtra("status", call.getString("message", ""));
        intent.putExtra("statusDetail", call.getString("detail", ""));
        intent.putExtra("requiresConfirmation", call.getBoolean("requiresConfirmation", false));
        intent.putExtra("primaryActionLabel", call.getString("primaryActionLabel", ""));
        intent.putExtra("secondaryActionLabel", call.getString("secondaryActionLabel", ""));
        getContext().startService(intent);

        JSObject result = new JSObject();
        result.put("status", "updated");
        call.resolve(result);
    }

    @PluginMethod
    public void updateTodos(PluginCall call) {
        Intent intent = new Intent(getContext(), FloatingAssistantService.class);
        intent.putExtra("todos", serializeTodos(call.getArray("todos")));
        getContext().startService(intent);

        JSObject result = new JSObject();
        result.put("status", "updated");
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), FloatingAssistantService.class);
        getContext().stopService(intent);

        JSObject result = new JSObject();
        result.put("status", "stopped");
        call.resolve(result);
    }

    @PluginMethod
    public void consumePendingCommand(PluginCall call) {
        JSObject result = new JSObject();
        result.put("command", pendingCommand);
        result.put("action", pendingAction);
        pendingCommand = "";
        pendingAction = "";
        call.resolve(result);
    }

    public static void setPendingCommand(String command) {
        pendingCommand = command == null ? "" : command.trim();
    }

    public static void requestForegroundVoiceCapture() {
        pendingAction = "foreground-voice-capture";
    }

    public static void setPendingAction(String action) {
        pendingAction = action == null ? "" : action.trim();
    }

    private boolean hasOverlayPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(getContext());
    }

    private void resolvePermission(PluginCall call, String status) {
        JSObject result = new JSObject();
        result.put("status", status);
        call.resolve(result);
    }

    private String[] serializeTodos(JSArray todos) {
        if (todos == null) return new String[0];

        int count = Math.min(3, todos.length());
        String[] result = new String[count];
        for (int index = 0; index < count; index += 1) {
            JSONObject todo = todos.optJSONObject(index);
            if (todo == null) {
                result[index] = "";
                continue;
            }
            String title = todo.optString("title", "待办");
            String dueAt = todo.optString("dueAt", "");
            String formattedDueAt = dueAt.replace("T", " ");
            result[index] = dueAt.isEmpty()
                ? title
                : title + " · " + formattedDueAt.substring(0, Math.min(16, formattedDueAt.length()));
        }
        return result;
    }
}
