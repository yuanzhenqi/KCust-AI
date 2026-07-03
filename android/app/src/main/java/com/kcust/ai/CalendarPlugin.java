package com.kcust.ai;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

@CapacitorPlugin(
    name = "Calendar",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_CALENDAR }, alias = CalendarPlugin.READ_PERMISSION),
        @Permission(strings = { Manifest.permission.WRITE_CALENDAR }, alias = CalendarPlugin.WRITE_PERMISSION)
    }
)
public class CalendarPlugin extends Plugin {
    static final String READ_PERMISSION = "calendarRead";
    static final String WRITE_PERMISSION = "calendarWrite";

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        resolvePermissions(call);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (hasCalendarPermissions()) {
            resolvePermissions(call);
            return;
        }

        requestPermissionForAliases(new String[] { READ_PERMISSION, WRITE_PERMISSION }, call, "permissionCallback");
    }

    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (getPermissionState(READ_PERMISSION) != PermissionState.GRANTED) {
            call.reject("Calendar read permission is not granted", "PERMISSION_DENIED");
            return;
        }

        JSArray calendars = new JSArray();
        Cursor cursor = getContext()
            .getContentResolver()
            .query(
                CalendarContract.Calendars.CONTENT_URI,
                new String[] {
                    CalendarContract.Calendars._ID,
                    CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
                    CalendarContract.Calendars.IS_PRIMARY
                },
                null,
                null,
                CalendarContract.Calendars.IS_PRIMARY + " DESC"
            );

        if (cursor != null) {
            try {
                while (cursor.moveToNext()) {
                    JSObject calendar = new JSObject();
                    calendar.put("id", String.valueOf(cursor.getLong(0)));
                    calendar.put("name", cursor.getString(1));
                    calendar.put("isPrimary", cursor.getInt(2) == 1);
                    calendars.put(calendar);
                }
            } finally {
                cursor.close();
            }
        }

        JSObject result = new JSObject();
        result.put("calendars", calendars);
        call.resolve(result);
    }

    @PluginMethod
    public void createEvent(PluginCall call) {
        if (!hasCalendarPermissions()) {
            call.reject("Calendar permissions are not granted", "PERMISSION_DENIED");
            return;
        }

        String title = call.getString("title", "KCUST AI 客户提醒");
        String startAt = call.getString("startAt");
        String endAt = call.getString("endAt");
        String notes = call.getString("notes", "");
        String requestedCalendarId = call.getString("calendarId");

        if (startAt == null || endAt == null) {
            call.reject("startAt and endAt are required", "INVALID_INPUT");
            return;
        }

        Long calendarId = requestedCalendarId == null ? findWritableCalendarId() : parseCalendarId(requestedCalendarId);
        if (calendarId == null) {
            call.reject("No writable calendar found", "NO_CALENDAR");
            return;
        }

        ContentValues values = new ContentValues();
        values.put(CalendarContract.Events.DTSTART, parseIsoMillis(startAt));
        values.put(CalendarContract.Events.DTEND, parseIsoMillis(endAt));
        values.put(CalendarContract.Events.TITLE, title);
        values.put(CalendarContract.Events.DESCRIPTION, notes);
        values.put(CalendarContract.Events.CALENDAR_ID, calendarId);
        values.put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().getID());

        Uri eventUri = getContext().getContentResolver().insert(CalendarContract.Events.CONTENT_URI, values);
        if (eventUri == null) {
            call.reject("Failed to create calendar event", "INSERT_FAILED");
            return;
        }

        JSObject result = new JSObject();
        result.put("eventId", eventUri.getLastPathSegment());
        result.put("calendarId", String.valueOf(calendarId));
        call.resolve(result);
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        resolvePermissions(call);
    }

    private boolean hasCalendarPermissions() {
        return (
            getPermissionState(READ_PERMISSION) == PermissionState.GRANTED &&
            getPermissionState(WRITE_PERMISSION) == PermissionState.GRANTED
        );
    }

    private void resolvePermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("read", getPermissionState(READ_PERMISSION) == PermissionState.GRANTED ? "granted" : "denied");
        result.put("write", getPermissionState(WRITE_PERMISSION) == PermissionState.GRANTED ? "granted" : "denied");
        call.resolve(result);
    }

    private Long findWritableCalendarId() {
        ContentResolver resolver = getContext().getContentResolver();
        Cursor cursor = resolver.query(
            CalendarContract.Calendars.CONTENT_URI,
            new String[] { CalendarContract.Calendars._ID },
            CalendarContract.Calendars.VISIBLE + " = 1",
            null,
            CalendarContract.Calendars.IS_PRIMARY + " DESC"
        );

        if (cursor == null) return null;
        try {
            if (cursor.moveToFirst()) return cursor.getLong(0);
            return null;
        } finally {
            cursor.close();
        }
    }

    private Long parseCalendarId(String value) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private long parseIsoMillis(String value) {
        try {
            SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US);
            Date date = formatter.parse(value);
            return date == null ? System.currentTimeMillis() : date.getTime();
        } catch (ParseException exception) {
            return System.currentTimeMillis();
        }
    }
}
