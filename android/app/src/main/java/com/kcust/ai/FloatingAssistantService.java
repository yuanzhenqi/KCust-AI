package com.kcust.ai;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.iflytek.sparkchain.core.SparkChain;
import com.iflytek.sparkchain.core.SparkChainConfig;
import com.iflytek.sparkchain.core.asr.ASR;
import com.iflytek.sparkchain.core.asr.AsrCallbacks;
import com.iflytek.sparkchain.core.asr.AudioAttributes;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;

public class FloatingAssistantService extends Service {
    private static final String TAG = "KCustOverlay";
    private static final String NOTIFICATION_CHANNEL_ID = "kcust_floating_agent";
    private static final int NOTIFICATION_ID = 4101;
    private static final int SAMPLE_RATE = 16000;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WindowManager windowManager;
    private TextView bubbleView;
    private View scrimView;
    private LinearLayout panelView;
    private LinearLayout bottomVoiceView;
    private LinearLayout confirmationView;
    private WindowManager.LayoutParams bubbleParams;
    private WindowManager.LayoutParams scrimParams;
    private WindowManager.LayoutParams panelParams;
    private WindowManager.LayoutParams bottomVoiceParams;
    private TextView bottomHoldButton;
    private TextView bottomHintText;
    private TextView statusText;
    private TextView detailText;
    private TextView agentBadgeText;
    private TextView confirmationTitleText;
    private TextView confirmationDetailText;
    private TextView confirmButton;
    private TextView dismissButton;
    private int initialX;
    private int initialY;
    private float initialTouchX;
    private float initialTouchY;
    private float holdStartY;
    private int initialPanelX;
    private int initialPanelY;
    private float initialPanelTouchX;
    private float initialPanelTouchY;
    private boolean panelVisible = false;
    private boolean overlayVoiceCanceling = false;
    private boolean sparkChainInitialized = false;
    private ASR activeAsr = null;
    private AudioRecord activeRecorder = null;
    private Thread activeRecordThread = null;
    private final AtomicBoolean isRecording = new AtomicBoolean(false);
    private int panelAnimationToken = 0;
    private long panelShownAtMs = 0L;
    private int dockSide = DOCK_LEFT;
    private int sizeLevel = SIZE_MEDIUM;
    private float overlayAlpha = 1.0f;

    private static final int DOCK_LEFT = 0;
    private static final int DOCK_RIGHT = 1;
    private static final int SIZE_SMALL = 0;
    private static final int SIZE_MEDIUM = 1;
    private static final int SIZE_LARGE = 2;

    @Override
    public void onCreate() {
        super.onCreate();
        startMicrophoneForegroundService();
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        bubbleView = createBubbleView();
        scrimView = createScrimView();
        panelView = createPanelView(new String[0]);
        bottomVoiceView = createBottomVoiceView();
        bubbleParams = createBubbleParams();
        scrimParams = createScrimParams();
        panelParams = createPanelParams();
        bottomVoiceParams = createBottomVoiceParams();
        scrimView.setVisibility(View.GONE);
        panelView.setVisibility(View.GONE);
        bottomVoiceView.setVisibility(View.GONE);
        windowManager.addView(scrimView, scrimParams);
        windowManager.addView(panelView, panelParams);
        windowManager.addView(bottomVoiceView, bottomVoiceParams);
        windowManager.addView(bubbleView, bubbleParams);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && (
            intent.hasExtra("dockSide") ||
            intent.hasExtra("overlaySize") ||
            intent.hasExtra("overlayOpacity")
        )) {
            applyConfig(intent);
        }
        if (intent != null && intent.hasExtra("todos")) {
            String[] todos = intent.getStringArrayExtra("todos");
            refreshPanelTodos(todos == null ? new String[0] : todos);
        }
        if (intent != null && intent.hasExtra("status")) {
            updateStatus(
                intent.getStringExtra("status"),
                intent.getStringExtra("statusDetail"),
                intent.getBooleanExtra("requiresConfirmation", false),
                intent.getStringExtra("primaryActionLabel"),
                intent.getStringExtra("secondaryActionLabel")
            );
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (panelView != null && windowManager != null && panelView.getParent() != null) {
            windowManager.removeView(panelView);
        }
        if (bottomVoiceView != null && windowManager != null && bottomVoiceView.getParent() != null) {
            windowManager.removeView(bottomVoiceView);
        }
        if (scrimView != null && windowManager != null && scrimView.getParent() != null) {
            windowManager.removeView(scrimView);
        }
        if (bubbleView != null && windowManager != null) {
            windowManager.removeView(bubbleView);
        }
        bubbleView = null;
        scrimView = null;
        panelView = null;
        bottomVoiceView = null;
        cleanupIflytekSession(true);
        if (sparkChainInitialized) {
            SparkChain.getInst().unInit();
            sparkChainInitialized = false;
        }
    }

    private TextView createBubbleView() {
        TextView view = new TextView(this);
        view.setText("›");
        view.setTextColor(Color.WHITE);
        view.setTextSize(24);
        view.setGravity(Gravity.CENTER);
        view.setTypeface(null, android.graphics.Typeface.BOLD);

        view.setBackground(sideHandleBackground(DOCK_LEFT));
        view.setElevation(20);

        view.setOnTouchListener((target, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    initialX = bubbleParams.x;
                    initialY = bubbleParams.y;
                    initialTouchX = event.getRawX();
                    initialTouchY = event.getRawY();
                    return true;
                case MotionEvent.ACTION_UP:
                    if (Math.abs(event.getRawX() - initialTouchX) < 8 && Math.abs(event.getRawY() - initialTouchY) < 8) {
                        togglePanel();
                    } else {
                        snapHandleToNearestSide();
                    }
                    return true;
                case MotionEvent.ACTION_MOVE:
                    bubbleParams.x = initialX + (int) (event.getRawX() - initialTouchX);
                    bubbleParams.y = initialY + (int) (event.getRawY() - initialTouchY);
                    clampHandleParams();
                    windowManager.updateViewLayout(target, bubbleParams);
                    if (panelVisible) {
                        positionPanelNearHandle();
                        windowManager.updateViewLayout(panelView, panelParams);
                    }
                    return true;
                default:
                    return false;
            }
        });

        return view;
    }

    private View createScrimView() {
        View view = new View(this);
        view.setBackgroundColor(Color.TRANSPARENT);
        view.setAlpha(0f);
        view.setOnTouchListener((target, event) -> {
            if (!panelVisible) return false;
            if (event.getAction() == MotionEvent.ACTION_UP) hidePanel();
            return true;
        });
        return view;
    }

    private LinearLayout createPanelView(String[] todos) {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(22, 20, 22, 20);
        panel.setBackground(panelBackground());
        panel.setElevation(24);

        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout dragArea = new LinearLayout(this);
        dragArea.setLayoutParams(new LinearLayout.LayoutParams(0, 36, 1f));
        dragArea.setGravity(Gravity.CENTER);
        dragArea.setOnTouchListener((target, event) -> handlePanelDrag(event));
        View dragPill = new View(this);
        dragPill.setLayoutParams(new LinearLayout.LayoutParams(72, 8));
        dragPill.setBackground(dragHandleBackground());
        dragArea.addView(dragPill);
        agentBadgeText = text("KCUST Agent", 12, Color.rgb(151, 109, 54), true);
        agentBadgeText.setGravity(Gravity.CENTER);
        agentBadgeText.setPadding(12, 7, 12, 7);
        agentBadgeText.setBackground(roundBackground(Color.rgb(247, 238, 224), 999));

        TextView collapseButton = text("收起", 12, Color.rgb(111, 81, 45), true);
        collapseButton.setGravity(Gravity.CENTER);
        collapseButton.setPadding(12, 8, 12, 8);
        collapseButton.setBackground(roundBackground(Color.rgb(248, 242, 232), 999));
        collapseButton.setOnClickListener((view) -> hidePanel());
        header.addView(agentBadgeText);
        header.addView(dragArea);
        header.addView(collapseButton);

        statusText = text("等待一句客户指令", 16, Color.rgb(42, 36, 29), true);
        statusText.setPadding(0, 14, 0, 2);
        detailText = text("按住底部按钮，说完松手，结果会留在这里", 12, Color.rgb(126, 113, 100), false);
        confirmationView = createConfirmationView();

        TextView todoTitle = text("最近待办", 14, Color.rgb(42, 36, 29), true);
        LinearLayout todoList = new LinearLayout(this);
        todoList.setOrientation(LinearLayout.VERTICAL);
        todoList.setTag("todo-list");
        panel.addView(header);
        panel.addView(statusText);
        panel.addView(space(4));
        panel.addView(detailText);
        panel.addView(space(10));
        panel.addView(confirmationView);
        panel.addView(space(16));
        panel.addView(todoTitle);
        panel.addView(todoList);
        panel.addView(space(12));

        TextView openApp = text("回到 App", 13, Color.rgb(111, 81, 45), true);
        openApp.setGravity(Gravity.CENTER);
        openApp.setPadding(12, 12, 12, 12);
        openApp.setBackground(roundBackground(Color.rgb(248, 242, 232), 18));
        openApp.setOnClickListener((view) -> openMainActivity());
        panel.addView(openApp);

        refreshTodoList(todoList, todos);
        return panel;
    }

    private LinearLayout createBottomVoiceView() {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(14, 12, 14, 12);
        container.setBackground(voiceDockBackground(false));
        container.setElevation(28);

        bottomHoldButton = text("按住录音", 16, Color.WHITE, true);
        bottomHoldButton.setGravity(Gravity.CENTER);
        bottomHoldButton.setPadding(24, 18, 24, 18);
        bottomHoldButton.setBackground(roundBackground(Color.rgb(47, 40, 31), 999));
        bottomHoldButton.setOnTouchListener((target, event) -> handleHoldTouch(event));

        bottomHintText = text("松开发送，上滑取消", 12, Color.rgb(112, 95, 73), false);
        bottomHintText.setGravity(Gravity.CENTER);
        bottomHintText.setPadding(0, 8, 0, 0);

        container.addView(bottomHoldButton);
        container.addView(bottomHintText);
        return container;
    }

    private LinearLayout createConfirmationView() {
        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        container.setPadding(14, 14, 14, 14);
        container.setBackground(confirmationBackground());
        container.setVisibility(View.GONE);

        confirmationTitleText = text("需要确认", 14, Color.rgb(42, 36, 29), true);
        confirmationDetailText = text("确认后写入客户库", 12, Color.rgb(79, 69, 57), false);
        confirmationDetailText.setPadding(0, 6, 0, 10);

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.CENTER_VERTICAL);

        dismissButton = text("取消", 12, Color.rgb(111, 81, 45), true);
        dismissButton.setGravity(Gravity.CENTER);
        dismissButton.setPadding(14, 10, 14, 10);
        dismissButton.setBackground(roundBackground(Color.rgb(255, 253, 248), 999));
        dismissButton.setOnClickListener((view) -> {
            OverlayPlugin.setPendingAction("overlay-dismiss");
            updateStatus("已取消确认", "等待下一句客户指令");
        });

        confirmButton = text("确认保存", 12, Color.WHITE, true);
        confirmButton.setGravity(Gravity.CENTER);
        confirmButton.setPadding(16, 10, 16, 10);
        confirmButton.setBackground(roundBackground(Color.rgb(47, 40, 31), 999));
        confirmButton.setOnClickListener((view) -> {
            OverlayPlugin.setPendingAction("overlay-confirm");
            updateStatus("正在保存", "正在写入客户库");
        });

        actions.addView(dismissButton);
        actions.addView(space(8));
        actions.addView(confirmButton);

        container.addView(confirmationTitleText);
        container.addView(confirmationDetailText);
        container.addView(actions);
        return container;
    }

    private boolean handleHoldTouch(MotionEvent event) {
        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                holdStartY = event.getRawY();
                overlayVoiceCanceling = false;
                updateStatus("正在录音", "松开发送，上滑取消");
                if (bottomVoiceView != null) bottomVoiceView.setBackground(voiceDockBackground(true));
                if (bottomHoldButton != null) bottomHoldButton.setText("录音中");
                if (bottomHintText != null) bottomHintText.setText("松开发送，上滑取消");
                startNativeOverlayVoice();
                return true;
            case MotionEvent.ACTION_MOVE:
                overlayVoiceCanceling = holdStartY - event.getRawY() > 72;
                if (bottomHoldButton != null) bottomHoldButton.setText(overlayVoiceCanceling ? "松手取消" : "录音中");
                if (bottomHintText != null) bottomHintText.setText(overlayVoiceCanceling ? "松手后不会发送" : "松开发送，上滑取消");
                return true;
            case MotionEvent.ACTION_UP:
                if (overlayVoiceCanceling) {
                    cancelNativeOverlayVoice();
                } else {
                    stopNativeOverlayVoice();
                }
                updateStatus(overlayVoiceCanceling ? "已取消录音" : "正在识别", overlayVoiceCanceling ? "等待下一句客户指令" : "正在整理语音文字");
                overlayVoiceCanceling = false;
                if (bottomVoiceView != null) bottomVoiceView.setBackground(voiceDockBackground(false));
                if (bottomHoldButton != null) bottomHoldButton.setText("按住录音");
                if (bottomHintText != null) bottomHintText.setText("松开发送，上滑取消");
                return true;
            case MotionEvent.ACTION_CANCEL:
                cancelNativeOverlayVoice();
                overlayVoiceCanceling = false;
                if (bottomVoiceView != null) bottomVoiceView.setBackground(voiceDockBackground(false));
                if (bottomHoldButton != null) bottomHoldButton.setText("按住录音");
                if (bottomHintText != null) bottomHintText.setText("松开发送，上滑取消");
                return true;
            default:
                return false;
        }
    }

    private void togglePanel() {
        if (panelVisible) {
            hidePanel();
            return;
        }
        showPanel();
    }

    private void showPanel() {
        if (panelVisible && panelView != null && panelView.getVisibility() == View.VISIBLE) return;
        panelAnimationToken += 1;
        panelVisible = true;
        panelShownAtMs = System.currentTimeMillis();
        cancelPanelAnimations();
        positionPanelNearHandle();
        scrimView.setVisibility(View.VISIBLE);
        scrimView.setAlpha(0f);
        panelView.setVisibility(View.VISIBLE);
        bottomVoiceView.setVisibility(View.VISIBLE);
        panelView.setAlpha(0f);
        panelView.setTranslationX(dockSide == DOCK_RIGHT ? 18f : -18f);
        bottomVoiceView.setAlpha(0f);
        bottomVoiceView.setTranslationY(18f);
        scrimView.animate().alpha(1f).setDuration(90).start();
        panelView.animate().alpha(1f).translationX(0f).setDuration(150).start();
        bottomVoiceView.animate().alpha(1f).translationY(0f).setDuration(150).start();
    }

    private void hidePanel() {
        if (panelView == null || windowManager == null) return;
        if (
            !panelVisible &&
            panelView.getVisibility() != View.VISIBLE &&
            (bottomVoiceView == null || bottomVoiceView.getVisibility() != View.VISIBLE)
        ) return;
        panelAnimationToken += 1;
        final int animationToken = panelAnimationToken;
        panelVisible = false;
        cancelPanelAnimations();
        if (scrimView != null) {
            scrimView.animate()
                .alpha(0f)
                .setDuration(80)
                .withEndAction(() -> {
                    if (animationToken != panelAnimationToken) return;
                    if (scrimView != null) {
                        scrimView.setVisibility(View.GONE);
                        scrimView.setAlpha(0f);
                    }
                })
                .start();
        }
        panelView.animate()
            .alpha(0f)
            .translationX(dockSide == DOCK_RIGHT ? 18f : -18f)
            .setDuration(120)
            .withEndAction(() -> {
                if (animationToken != panelAnimationToken) return;
                if (panelView != null) {
                    panelView.setVisibility(View.GONE);
                    resetPanelAppearance();
                }
            })
            .start();
        if (bottomVoiceView != null && bottomVoiceView.getVisibility() == View.VISIBLE) {
            bottomVoiceView.animate()
                .alpha(0f)
                .translationY(18f)
                .setDuration(120)
                .withEndAction(() -> {
                    if (animationToken != panelAnimationToken) return;
                    if (bottomVoiceView != null) {
                        bottomVoiceView.setVisibility(View.GONE);
                        bottomVoiceView.setAlpha(1f);
                        bottomVoiceView.setTranslationY(0f);
                    }
                })
                .start();
        }
    }

    private void cancelPanelAnimations() {
        if (scrimView != null) scrimView.animate().cancel();
        if (panelView != null) panelView.animate().cancel();
        if (bottomVoiceView != null) bottomVoiceView.animate().cancel();
    }

    private void resetPanelAppearance() {
        if (panelView == null) return;
        panelView.setAlpha(1f);
        panelView.setTranslationX(0f);
    }

    private void startNativeOverlayVoice() {
        if (!hasAudioPermission()) {
            updateStatus("麦克风未授权", "请先回到 App 授权麦克风权限");
            return;
        }
        if (!isIflytekConfigured()) {
            updateStatus("讯飞语音未配置", "悬浮窗语音需要科大讯飞无界面识别");
            return;
        }
        if (activeAsr != null) {
            updateStatus("正在录音", "上一段语音仍在处理中");
            return;
        }
        if (!ensureSparkChainInitialized() || !startIflytekSession()) {
            updateStatus("语音启动失败", "请检查讯飞配置或网络后重试");
            return;
        }
        updateStatus("正在录音", "讯飞识别中，松开发送，上滑取消");
    }

    private void stopNativeOverlayVoice() {
        if (activeAsr == null) {
            updateStatus("没有识别到语音", "请按住后再说话");
            return;
        }
        stopRecorderOnly();
        try {
            activeAsr.stop(false);
        } catch (Exception exception) {
            Log.w(TAG, "iFlytek ASR stop exception", exception);
            cleanupIflytekSession(true);
            updateStatus("识别失败", "请再说一次");
        }
    }

    private void cancelNativeOverlayVoice() {
        cleanupIflytekSession(true);
        OverlayPlugin.setPendingAction("overlay-voice-cancel");
        updateStatus("已取消录音", "等待下一句客户指令");
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

    private AsrCallbacks createIflytekCallbacks() {
        return new AsrCallbacks() {
            @Override
            public void onResult(ASR.ASRResult asrResult, Object usrContext) {
                if (asrResult == null) return;

                String text = asrResult.getBestMatchText();
                if (asrResult.getStatus() == 2) {
                    String transcript = text == null ? "" : text.trim();
                    cleanupIflytekSession(false);
                    if (transcript.isEmpty()) {
                        updateStatus("没有识别到语音", "请靠近麦克风再说一次");
                        return;
                    }
                    OverlayPlugin.setPendingCommand(transcript);
                    updateStatus("已识别语音", transcript);
                }
            }

            @Override
            public void onError(ASR.ASRError asrError, Object usrContext) {
                int code = asrError == null ? -1 : asrError.getCode();
                Log.w(TAG, "iFlytek ASR error: " + code);
                cleanupIflytekSession(true);
                updateStatus("识别失败", "讯飞返回错误：" + code);
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
        }, "KCustOverlayIflytekRecorder");
        activeRecordThread.start();
    }

    private void cleanupIflytekSession(boolean cancelAsr) {
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

    private boolean ensureSparkChainInitialized() {
        if (sparkChainInitialized) return true;

        try {
            SparkChainConfig config = SparkChainConfig.builder()
                .appID(BuildConfig.IFLYTEK_APP_ID)
                .apiKey(BuildConfig.IFLYTEK_API_KEY)
                .apiSecret(BuildConfig.IFLYTEK_API_SECRET);
            int ret = SparkChain.getInst().init(getApplicationContext(), config);
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

    private boolean hasAudioPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
            || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean isIflytekConfigured() {
        return !BuildConfig.IFLYTEK_APP_ID.trim().isEmpty()
            && !BuildConfig.IFLYTEK_API_KEY.trim().isEmpty()
            && !BuildConfig.IFLYTEK_API_SECRET.trim().isEmpty();
    }

    private void startMicrophoneForegroundService() {
        createNotificationChannel();
        Notification notification = createForegroundNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && hasAudioPermission()) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            return;
        }
        startForeground(NOTIFICATION_ID, notification);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            "KCUST 悬浮助手",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("悬浮窗语音识别与客户助理状态");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification createForegroundNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
                : PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
            : new Notification.Builder(this);
        return builder
            .setContentTitle("KCUST AI 悬浮助手")
            .setContentText("语音待命中，可在悬浮窗内呼出 Agent")
            .setSmallIcon(getApplicationInfo().icon)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build();
    }

    private void refreshPanelTodos(String[] todos) {
        if (panelView == null) return;
        LinearLayout todoList = panelView.findViewWithTag("todo-list");
        if (todoList != null) refreshTodoList(todoList, todos);
    }

    private void refreshTodoList(LinearLayout todoList, String[] todos) {
        todoList.removeAllViews();
        if (todos.length == 0) {
            todoList.addView(text("暂无待办", 12, Color.rgb(126, 113, 100), false));
            return;
        }

        for (String todo : todos) {
            if (todo == null || todo.trim().isEmpty()) continue;
            TextView item = text(todo, 12, Color.rgb(79, 69, 57), false);
            item.setPadding(12, 9, 12, 9);
            item.setMaxLines(2);
            item.setBackground(roundBackground(Color.rgb(248, 242, 232), 14));
            todoList.addView(item);
            todoList.addView(space(6));
        }
    }

    private WindowManager.LayoutParams createBubbleParams() {
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            handleWidth(),
            handleHeight(),
            overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 0;
        params.y = 240;
        return params;
    }

    private WindowManager.LayoutParams createScrimParams() {
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 0;
        params.y = 0;
        return params;
    }

    private WindowManager.LayoutParams createPanelParams() {
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            panelWidth(),
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 12;
        params.y = 286;
        return params;
    }

    private WindowManager.LayoutParams createBottomVoiceParams() {
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            Math.min(620, resourcesWidth() - 48),
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        params.x = 0;
        params.y = 48;
        return params;
    }

    private int overlayType() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(null, android.graphics.Typeface.BOLD);
        return view;
    }

    private View space(int height) {
        View view = new View(this);
        view.setLayoutParams(new LinearLayout.LayoutParams(1, height));
        return view;
    }

    private GradientDrawable panelBackground() {
        GradientDrawable background = roundBackground(Color.rgb(255, 253, 248), 28);
        background.setStroke(1, Color.argb(40, 99, 79, 50));
        return background;
    }

    private GradientDrawable confirmationBackground() {
        GradientDrawable background = roundBackground(Color.rgb(244, 248, 240), 18);
        background.setStroke(1, Color.argb(55, 100, 129, 91));
        return background;
    }

    private GradientDrawable voiceDockBackground(boolean recording) {
        GradientDrawable background = roundBackground(
            recording ? Color.rgb(244, 248, 240) : Color.rgb(255, 253, 248),
            30
        );
        background.setStroke(
            1,
            recording ? Color.argb(90, 100, 129, 91) : Color.argb(55, 151, 109, 54)
        );
        return background;
    }

    private GradientDrawable dragHandleBackground() {
        GradientDrawable background = roundBackground(Color.rgb(239, 228, 211), 999);
        background.setSize(72, 8);
        return background;
    }

    private GradientDrawable sideHandleBackground(int side) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.rgb(138, 99, 49));
        if (side == DOCK_RIGHT) {
            background.setCornerRadii(new float[] {
                24, 24,
                0, 0,
                0, 0,
                24, 24
            });
        } else {
            background.setCornerRadii(new float[] {
                0, 0,
                24, 24,
                24, 24,
                0, 0
            });
        }
        return background;
    }

    private GradientDrawable roundBackground(int color, int radius) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        background.setCornerRadius(radius);
        return background;
    }

    private void openMainActivity() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
    }

    private boolean handlePanelDrag(MotionEvent event) {
        switch (event.getAction()) {
            case MotionEvent.ACTION_DOWN:
                initialPanelX = panelParams.x;
                initialPanelY = panelParams.y;
                initialPanelTouchX = event.getRawX();
                initialPanelTouchY = event.getRawY();
                return true;
            case MotionEvent.ACTION_MOVE:
                panelParams.x = initialPanelX + (int) (event.getRawX() - initialPanelTouchX);
                panelParams.y = initialPanelY + (int) (event.getRawY() - initialPanelTouchY);
                clampPanelParams();
                windowManager.updateViewLayout(panelView, panelParams);
                return true;
            default:
                return false;
        }
    }

    private void updateStatus(String message, String detail) {
        updateStatus(message, detail, false, "", "");
    }

    private void updateStatus(String message, String detail, boolean requiresConfirmation, String primaryActionLabel, String secondaryActionLabel) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mainHandler.post(() -> updateStatus(message, detail, requiresConfirmation, primaryActionLabel, secondaryActionLabel));
            return;
        }
        if (statusText != null && message != null && !message.trim().isEmpty()) {
            statusText.setText(message.trim());
        }
        if (detailText != null) {
            detailText.setText(detail == null || detail.trim().isEmpty() ? "等待下一步" : detail.trim());
        }
        if (confirmationView == null) return;

        if (!requiresConfirmation) {
            confirmationView.setVisibility(View.GONE);
            return;
        }

        confirmationView.setVisibility(View.VISIBLE);
        if (confirmationTitleText != null) {
            confirmationTitleText.setText(message == null || message.trim().isEmpty() ? "需要确认" : message.trim());
        }
        if (confirmationDetailText != null) {
            confirmationDetailText.setText(detail == null || detail.trim().isEmpty() ? "确认后写入客户库" : detail.trim());
        }
        if (confirmButton != null) {
            String label = primaryActionLabel == null || primaryActionLabel.trim().isEmpty() ? "确认保存" : primaryActionLabel.trim();
            confirmButton.setText(label);
        }
        if (dismissButton != null) {
            String label = secondaryActionLabel == null || secondaryActionLabel.trim().isEmpty() ? "取消" : secondaryActionLabel.trim();
            dismissButton.setText(label);
        }
    }

    private void applyConfig(Intent intent) {
        String requestedDockSide = intent.getStringExtra("dockSide");
        String requestedSize = intent.getStringExtra("overlaySize");
        double requestedOpacity = intent.getDoubleExtra("overlayOpacity", overlayAlpha);

        if ("left".equals(requestedDockSide)) {
            dockSide = DOCK_LEFT;
            if (bubbleParams != null) bubbleParams.x = 0;
        } else if ("right".equals(requestedDockSide)) {
            dockSide = DOCK_RIGHT;
            if (bubbleParams != null) bubbleParams.x = resourcesWidth() - bubbleParams.width;
        } else if (bubbleParams != null) {
            dockSide = bubbleParams.x + bubbleParams.width / 2 > resourcesWidth() / 2 ? DOCK_RIGHT : DOCK_LEFT;
        }

        if ("small".equals(requestedSize)) {
            sizeLevel = SIZE_SMALL;
        } else if ("large".equals(requestedSize)) {
            sizeLevel = SIZE_LARGE;
        } else {
            sizeLevel = SIZE_MEDIUM;
        }

        overlayAlpha = requestedOpacity <= 0.7 ? 0.6f : requestedOpacity <= 0.9 ? 0.8f : 1.0f;
        updateHandleAppearance();
        if (bubbleParams != null && panelParams != null) applySizeAndOpacity();
    }

    private void snapHandleToNearestSide() {
        int screenWidth = resourcesWidth();
        dockSide = bubbleParams.x + bubbleParams.width / 2 > screenWidth / 2 ? DOCK_RIGHT : DOCK_LEFT;
        bubbleParams.x = dockSide == DOCK_RIGHT ? screenWidth - bubbleParams.width : 0;
        clampHandleParams();
        updateHandleAppearance();
        windowManager.updateViewLayout(bubbleView, bubbleParams);
        if (panelVisible) {
            positionPanelNearHandle();
            windowManager.updateViewLayout(panelView, panelParams);
        }
    }

    private void updateHandleAppearance() {
        if (bubbleView == null) return;
        bubbleView.setText(dockSide == DOCK_RIGHT ? "‹" : "›");
        bubbleView.setBackground(sideHandleBackground(dockSide));
    }

    private void positionPanelNearHandle() {
        panelParams.width = panelWidth();
        panelParams.y = bubbleParams.y;
        panelParams.x = dockSide == DOCK_RIGHT
            ? resourcesWidth() - panelParams.width - 12
            : 12;
        clampPanelParams();
    }

    private void applySizeAndOpacity() {
        bubbleParams.width = handleWidth();
        bubbleParams.height = handleHeight();
        if (dockSide == DOCK_RIGHT) bubbleParams.x = resourcesWidth() - bubbleParams.width;
        clampHandleParams();
        bubbleView.setAlpha(overlayAlpha);
        windowManager.updateViewLayout(bubbleView, bubbleParams);

        panelView.setAlpha(overlayAlpha);
        panelParams.width = panelWidth();
        if (bottomVoiceParams != null) {
            bottomVoiceParams.width = Math.min(panelWidth(), resourcesWidth() - 48);
        }
        if (bottomVoiceView != null) {
            bottomVoiceView.setAlpha(overlayAlpha);
        }
        if (panelVisible) {
            positionPanelNearHandle();
            windowManager.updateViewLayout(panelView, panelParams);
            if (bottomVoiceView != null && bottomVoiceView.getParent() != null) {
                windowManager.updateViewLayout(bottomVoiceView, bottomVoiceParams);
            }
        }
    }

    private void clampHandleParams() {
        int screenWidth = resourcesWidth();
        int screenHeight = resourcesHeight();
        bubbleParams.x = Math.max(0, Math.min(bubbleParams.x, screenWidth - bubbleParams.width));
        bubbleParams.y = Math.max(0, Math.min(bubbleParams.y, screenHeight - bubbleParams.height));
    }

    private void clampPanelParams() {
        int screenWidth = resourcesWidth();
        int screenHeight = resourcesHeight();
        panelParams.x = Math.max(0, Math.min(panelParams.x, screenWidth - panelParams.width));
        panelParams.y = Math.max(0, Math.min(panelParams.y, screenHeight - 260));
    }

    private int handleWidth() {
        if (sizeLevel == SIZE_SMALL) return 48;
        if (sizeLevel == SIZE_LARGE) return 70;
        return 58;
    }

    private int handleHeight() {
        if (sizeLevel == SIZE_SMALL) return 112;
        if (sizeLevel == SIZE_LARGE) return 154;
        return 132;
    }

    private int panelWidth() {
        int desired = sizeLevel == SIZE_SMALL ? 600 : sizeLevel == SIZE_LARGE ? 740 : 664;
        return Math.min(desired, resourcesWidth() - 24);
    }

    private int resourcesWidth() {
        return getResources().getDisplayMetrics().widthPixels;
    }

    private int resourcesHeight() {
        return getResources().getDisplayMetrics().heightPixels;
    }
}
