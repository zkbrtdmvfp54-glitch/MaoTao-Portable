#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod input_hook;
mod settings;
mod tray;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use settings::{MenuStateSnapshot, PomodoroState, Position, Preferences, SettingsStore};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::image::Image;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position as TauriPos,
    Size as TauriSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as AutostartManagerExt};

const PET_W: f64 = 420.0;
const PET_H: f64 = 340.0;
const PEEK_VISIBLE_WIDTH: f64 = 220.0;
const MASK_W: usize = 105;
const MASK_H: usize = 85;
const MENU_W: f64 = 372.0;
const MENU_H: f64 = 612.0;

fn pet_viewport(keyboard_visible: bool) -> (f64, f64, f64, f64) {
    if keyboard_visible {
        (0.0, 0.0, PET_W, PET_H)
    } else {
        (120.0, 40.0, 180.0, 260.0)
    }
}

fn scene_origin_from_viewport(pos: Position, size: PhysicalSize<u32>, viewport: (f64, f64, f64, f64)) -> Position {
    Position {
        x: pos.x - (size.width as f64 * viewport.0 / viewport.2).round() as i32,
        y: pos.y - (size.height as f64 * viewport.1 / viewport.3).round() as i32,
    }
}

#[derive(Debug, Clone)]
struct PetDrag {
    cursor_x: f64,
    cursor_y: f64,
    win_x: i32,
    win_y: i32,
    win_w: u32,
    win_h: u32,
    from_edge_peek: bool,
}

#[derive(Debug, Clone)]
struct EdgePeek {
    side: String,
    restore: Position,
    work_area: (i32, i32, i32, i32),
}

#[derive(Debug, Clone)]
struct MenuDrag {
    dx: f64,
    dy: f64,
}

struct InnerState {
    store: SettingsStore,
    pomodoro: PomodoroState,
    mask: Option<Vec<u8>>,
    ignored: bool,
    drag: Option<PetDrag>,
    edge_peek: Option<EdgePeek>,
    edge_peek_press_held: bool,
    menu_drag: Option<MenuDrag>,
    menu_positioned: bool,
    last_cursor: Option<(f64, f64)>,
    last_sent: Instant,
    confirming_input: bool,
}

struct AppState(Mutex<InnerState>);

#[derive(Debug, Deserialize)]
struct PointArg {
    x: f64,
    y: f64,
}

#[derive(Debug, Deserialize)]
struct MenuCommand {
    #[serde(rename = "type")]
    cmd_type: String,
    key: Option<String>,
    value: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct TryKeyArg {
    code: String,
    key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CursorPayload {
    x: f64,
    y: f64,
    inside: bool,
    screen_x: f64,
    screen_y: f64,
}

#[derive(Debug, Clone, Serialize)]
struct DragMovePayload {
    dx: i32,
    dy: i32,
}

#[derive(Debug, Clone, Serialize)]
struct LocalInputPayload {
    kind: &'static str,
    code: String,
    key: String,
}

fn fit_position(x: i32, y: i32, w: i32, h: i32, wx: i32, wy: i32, ww: i32, wh: i32) -> (i32, i32) {
    let nx = x.max(wx).min(wx + (ww - w).max(0));
    let ny = y.max(wy).min(wy + (wh - h).max(0));
    (nx, ny)
}

fn monitor_work_area(win: &WebviewWindow, mode: &str, saved: Option<&Position>) -> (i32, i32, i32, i32, f64) {
    let monitors = win.available_monitors().unwrap_or_default();
    let chosen = if mode == "restore" {
        if let Some(pos) = saved {
            monitors
                .iter()
                .find(|m| {
                    let wa = m.work_area();
                    pos.x >= wa.position.x
                        && pos.x < wa.position.x + wa.size.width as i32
                        && pos.y >= wa.position.y
                        && pos.y < wa.position.y + wa.size.height as i32
                })
                .cloned()
        } else {
            None
        }
    } else {
        None
    };

    let monitor = chosen
        .or_else(|| {
            if mode == "primary" || mode == "restore" {
                win.primary_monitor().ok().flatten()
            } else {
                win.current_monitor().ok().flatten()
            }
        })
        .or_else(|| monitors.into_iter().next());

    if let Some(m) = monitor {
        let wa = m.work_area();
        (
            wa.position.x,
            wa.position.y,
            wa.size.width as i32,
            wa.size.height as i32,
            m.scale_factor(),
        )
    } else {
        (0, 0, 1920, 1080, 1.0)
    }
}

fn monitor_work_area_for_pet(
    win: &WebviewWindow,
    mode: &str,
    saved: Option<&Position>,
    viewport: (f64, f64, f64, f64),
    scale: f64,
) -> (i32, i32, i32, i32, f64) {
    let monitors = win.available_monitors().unwrap_or_default();
    let chosen = if mode == "restore" {
        saved.and_then(|origin| {
            monitors.iter().max_by_key(|monitor| {
                let dpr = monitor.scale_factor();
                let x = origin.x + (viewport.0 * scale * dpr).round() as i32;
                let y = origin.y + (viewport.1 * scale * dpr).round() as i32;
                let width = (viewport.2 * scale * dpr).round().max(1.0) as u32;
                let height = (viewport.3 * scale * dpr).round().max(1.0) as u32;
                let area = monitor.work_area();
                rect_overlap_area(
                    x, y, width, height,
                    area.position.x, area.position.y, area.size.width, area.size.height,
                )
            }).filter(|monitor| {
                let dpr = monitor.scale_factor();
                let x = origin.x + (viewport.0 * scale * dpr).round() as i32;
                let y = origin.y + (viewport.1 * scale * dpr).round() as i32;
                let width = (viewport.2 * scale * dpr).round().max(1.0) as u32;
                let height = (viewport.3 * scale * dpr).round().max(1.0) as u32;
                let area = monitor.work_area();
                rect_overlap_area(
                    x, y, width, height,
                    area.position.x, area.position.y, area.size.width, area.size.height,
                ) > 0
            }).cloned()
        })
    } else {
        None
    };
    let monitor = chosen
        .or_else(|| {
            if mode == "primary" || mode == "restore" {
                win.primary_monitor().ok().flatten()
            } else {
                win.current_monitor().ok().flatten()
            }
        })
        .or_else(|| monitors.into_iter().next());
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        (
            area.position.x,
            area.position.y,
            area.size.width as i32,
            area.size.height as i32,
            monitor.scale_factor(),
        )
    } else {
        (0, 0, 1920, 1080, 1.0)
    }
}

fn work_area_distance_squared(cursor_x: i64, cursor_y: i64, x: i32, y: i32, width: u32, height: u32) -> u128 {
    let left = x as i64;
    let top = y as i64;
    let right = left + width as i64;
    let bottom = top + height as i64;
    let dx = if cursor_x < left {
        left - cursor_x
    } else if cursor_x >= right {
        cursor_x - (right - 1)
    } else {
        0
    };
    let dy = if cursor_y < top {
        top - cursor_y
    } else if cursor_y >= bottom {
        cursor_y - (bottom - 1)
    } else {
        0
    };
    (dx as u128) * (dx as u128) + (dy as u128) * (dy as u128)
}

fn rect_overlap_area(ax: i32, ay: i32, aw: u32, ah: u32, bx: i32, by: i32, bw: u32, bh: u32) -> u128 {
    let left = (ax as i64).max(bx as i64);
    let top = (ay as i64).max(by as i64);
    let right = (ax as i64 + aw as i64).min(bx as i64 + bw as i64);
    let bottom = (ay as i64 + ah as i64).min(by as i64 + bh as i64);
    if right <= left || bottom <= top { return 0; }
    ((right - left) as u128) * ((bottom - top) as u128)
}

fn scaled_peek_visible_width(window_width: u32, side: &str, viewport: (f64, f64, f64, f64)) -> i32 {
    let visible_base = if viewport.0 == 0.0 && viewport.2 == PET_W {
        PEEK_VISIBLE_WIDTH
    } else if side == "right" {
        (216.0 - viewport.0).max(1.0)
    } else {
        (viewport.0 + viewport.2 - 204.0).max(1.0)
    };
    ((visible_base * window_width as f64 / viewport.2).round() as i32).clamp(1, window_width as i32)
}

fn monitor_work_area_for_rect(win: &WebviewWindow, x: i32, y: i32, width: u32, height: u32) -> (i32, i32, i32, i32, f64) {
    let monitors = win.available_monitors().unwrap_or_default();
    let monitor = monitors.iter().max_by_key(|monitor| {
        let area = monitor.work_area();
        rect_overlap_area(x, y, width, height, area.position.x, area.position.y, area.size.width, area.size.height)
    });
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        if rect_overlap_area(x, y, width, height, area.position.x, area.position.y, area.size.width, area.size.height) > 0 {
            return (
                area.position.x,
                area.position.y,
                area.size.width as i32,
                area.size.height as i32,
                monitor.scale_factor(),
            );
        }
    }
    monitor_work_area_at(win, (x as f64) + width as f64 * 0.5, (y as f64) + height as f64 * 0.5)
}

fn monitor_work_area_at(win: &WebviewWindow, cursor_x: f64, cursor_y: f64) -> (i32, i32, i32, i32, f64) {
    let monitors = win.available_monitors().unwrap_or_default();
    let cursor_x = cursor_x.round() as i64;
    let cursor_y = cursor_y.round() as i64;
    let monitor = monitors.into_iter().min_by_key(|monitor| {
        let area = monitor.work_area();
        work_area_distance_squared(
            cursor_x,
            cursor_y,
            area.position.x,
            area.position.y,
            area.size.width,
            area.size.height,
        )
    });
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        (
            area.position.x,
            area.position.y,
            area.size.width as i32,
            area.size.height as i32,
            monitor.scale_factor(),
        )
    } else {
        monitor_work_area(win, "current", None)
    }
}

#[cfg(test)]
mod monitor_tests {
    use super::work_area_distance_squared;

    #[test]
    fn cursor_prefers_the_portrait_display_and_supports_negative_coordinates() {
        let landscape = work_area_distance_squared(2100, 300, 0, 0, 1920, 1080);
        let portrait = work_area_distance_squared(2100, 300, 1920, -320, 1080, 1920);
        assert_eq!(portrait, 0);
        assert!(portrait < landscape);

        let negative_portrait = work_area_distance_squared(-700, 400, -1080, 0, 1080, 1920);
        let primary = work_area_distance_squared(-700, 400, 0, 0, 1920, 1080);
        assert_eq!(negative_portrait, 0);
        assert!(negative_portrait < primary);
    }

    #[test]
    fn tucked_width_tracks_window_scale_and_stays_clamped() {
        let full = pet_viewport(true);
        assert_eq!(scaled_peek_visible_width(315, "right", full), 165);
        assert_eq!(scaled_peek_visible_width(420, "right", full), 220);
        assert_eq!(scaled_peek_visible_width(630, "right", full), 330);
        assert_eq!(scaled_peek_visible_width(42, "right", full), 42);
        assert_eq!(scaled_peek_visible_width(180, "right", pet_viewport(false)), 96);
        assert_eq!(scaled_peek_visible_width(180, "left", pet_viewport(false)), 96);
    }

    #[test]
    fn occupied_display_uses_the_largest_window_overlap() {
        let primary_overlap = rect_overlap_area(-220, 0, 420, 340, -100, 0, 100, 100);
        let secondary_overlap = rect_overlap_area(-220, 0, 420, 340, 0, 0, 1920, 1080);
        assert_eq!(primary_overlap, 10_000);
        assert_eq!(secondary_overlap, 68_000);
        assert!(secondary_overlap > primary_overlap);
    }
}

fn place_pet(app: &AppHandle, mode: &str) {
    restore_edge_peek(app);
    let Some(win) = app.get_webview_window("pet") else {
        return;
    };
    let (prefs, saved) = {
        let st = app.state::<AppState>();
        let guard = st.0.lock().unwrap();
        (guard.store.prefs.clone(), guard.store.prefs.position.clone())
    };
    let viewport = pet_viewport(prefs.keyboard);
    let raw_scale = if prefs.scale.is_finite() {
        prefs.scale
    } else {
        match prefs.size.as_str() {
            "small" => 0.76,
            "large" => 1.26,
            _ => 1.0,
        }
    };
    let (wx, wy, ww, wh, dpr) = monitor_work_area_for_pet(&win, mode, saved.as_ref(), viewport, raw_scale);
    let max_w = (ww as f64 / dpr) / PET_W;
    let max_h = (wh as f64 / dpr) / PET_H;
    let scale = raw_scale.min(max_w).min(max_h).max(0.5);
    let phys_w = (viewport.2 * scale * dpr).round() as u32;
    let phys_h = (viewport.3 * scale * dpr).round() as u32;

    let (x, y) = if mode == "center" {
        (
            wx + (ww - phys_w as i32) / 2,
            wy + (wh - phys_h as i32) / 2,
        )
    } else if mode == "restore" {
        if let Some(pos) = saved {
            (
                pos.x + (viewport.0 * scale * dpr).round() as i32,
                pos.y + (viewport.1 * scale * dpr).round() as i32,
            )
        } else {
            let pad_x = (8.0 * dpr).round() as i32;
            let pad_y = (4.0 * dpr).round() as i32;
            let x = if prefs.dock == "left" {
                wx + pad_x
            } else {
                wx + ww - phys_w as i32 - pad_x
            };
            let y = wy + wh - phys_h as i32 - pad_y;
            (x, y)
        }
    } else {
        let pad_x = (8.0 * dpr).round() as i32;
        let pad_y = (4.0 * dpr).round() as i32;
        let x = if prefs.dock == "left" {
            wx + pad_x
        } else {
            wx + ww - phys_w as i32 - pad_x
        };
        let y = wy + wh - phys_h as i32 - pad_y;
        (x, y)
    };

    let (fx, fy) = fit_position(x, y, phys_w as i32, phys_h as i32, wx, wy, ww, wh);
    let _ = win.set_size(TauriSize::Physical(PhysicalSize::new(phys_w, phys_h)));
    let _ = win.set_position(TauriPos::Physical(PhysicalPosition::new(fx, fy)));
    if let Ok(mut guard) = app.state::<AppState>().0.lock() {
        guard.last_cursor = None;
    }
}

fn build_menu_state(app: &AppHandle) -> MenuStateSnapshot {
    let visible = app
        .get_webview_window("pet")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let st = app.state::<AppState>();
    let mut guard = st.0.lock().unwrap();
    guard.store.rollover();
    if guard.pomodoro.phase == "idle" {
        guard.pomodoro.remaining_sec = guard.store.prefs.focus_minutes.max(1) * 60;
    }
    MenuStateSnapshot {
        prefs: guard.store.prefs.clone(),
        stats: guard.store.stats.clone(),
        pomodoro: guard.pomodoro.clone(),
        listening: input_hook::is_active(),
        visible,
        unavailable_reason: input_hook::unavailable_reason().to_string(),
        version: app.package_info().version.to_string(),
        wayland_session: input_hook::is_wayland_session(),
    }
}

fn push_menu_state(app: &AppHandle) {
    let state = build_menu_state(app);
    let _ = app.emit_to("menu", "menu:state", &state);
    if let Some(tray_icon) = app.tray_by_id("main-tray") {
        if let Ok(menu) = tray::build_tray_menu(
            app,
            &state.prefs,
            state.listening,
            state.visible,
            &state.unavailable_reason,
            state.wayland_session,
        ) {
            let _ = tray_icon.set_menu(Some(menu));
        }
    }
}

fn send_prefs(app: &AppHandle) {
    let prefs = {
        let st = app.state::<AppState>();
        let guard = st.0.lock().unwrap();
        guard.store.prefs.clone()
    };
    input_hook::set_privacy(prefs.privacy_mode);
    let _ = app.emit_to("pet", "pet:preferences", &prefs);
    push_menu_state(app);
}

fn stop_input(app: &AppHandle) {
    let was = input_hook::is_active();
    let _ = input_hook::set_active(false);
    if was {
        let _ = app.emit_to("pet", "pet:action", "input-off");
    }
    push_menu_state(app);
}

fn apply_set(app: &AppHandle, key: &str, value: Value) {
    if key == "launchAtStartup" {
        if let Some(enabled) = value.as_bool() {
            let _ = set_launch_at_startup(app, enabled);
        }
        return;
    }
    if key == "standbyMode" && value.as_bool() == Some(true) {
        stop_input(app);
        let st = app.state::<AppState>();
        let mut guard = st.0.lock().unwrap();
        if guard.store.prefs.focus_mode {
            guard.store.set_value("focusMode", Value::Bool(false));
        }
    }
    if key == "keyboard" {
        let (keyboard_visible, has_position) = {
            let st = app.state::<AppState>();
            let guard = st.0.lock().unwrap();
            (guard.store.prefs.keyboard, guard.store.prefs.position.is_some())
        };
        if keyboard_visible != value.as_bool().unwrap_or(keyboard_visible) && !has_position {
            if let Some(win) = app.get_webview_window("pet") {
                if let (Ok(pos), Ok(size)) = (win.outer_position(), win.inner_size()) {
                    let origin = scene_origin_from_viewport(
                        Position { x: pos.x, y: pos.y },
                        size,
                        pet_viewport(keyboard_visible),
                    );
                    if let Ok(mut guard) = app.state::<AppState>().0.lock() {
                        guard.store.set_value("position", serde_json::json!({ "x": origin.x, "y": origin.y }));
                    }
                }
            }
        }
    }
    let (changed, has_pos, top_val) = {
        let st = app.state::<AppState>();
        let mut guard = st.0.lock().unwrap();
        let changed = guard.store.set_value(key, value);
        if key == "focusMinutes" && guard.pomodoro.phase == "idle" {
            guard.pomodoro.remaining_sec = guard.store.prefs.focus_minutes.max(1) * 60;
        }
        (changed, guard.store.prefs.position.is_some(), guard.store.prefs.top)
    };
    if !changed {
        return;
    }
    if key == "top" {
        if let Some(win) = app.get_webview_window("pet") {
            let _ = win.set_always_on_top(top_val);
        }
    }
    if key == "size" || key == "scale" || key == "keyboard" {
        place_pet(app, if has_pos { "restore" } else { "dock" });
    }
    send_prefs(app);
}

fn set_launch_at_startup(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|error| error.to_string())?;
    } else {
        manager.disable().map_err(|error| error.to_string())?;
    }
    {
        let st = app.state::<AppState>();
        let mut guard = st.0.lock().map_err(|error| error.to_string())?;
        guard.store.set_value("launchAtStartup", Value::Bool(enabled));
    }
    send_prefs(app);
    push_menu_state(app);
    Ok(())
}

fn show_pet(app: &AppHandle) {
    restore_edge_peek(app);
    if let Some(win) = app.get_webview_window("pet") {
        let top = app.state::<AppState>().0.lock().unwrap().store.prefs.top;
        let _ = win.unminimize();
        let _ = win.set_visible_on_all_workspaces(true);
        let _ = win.show();
        let _ = win.set_always_on_top(top);
    }
    push_menu_state(app);
}

fn hide_pet(app: &AppHandle) {
    restore_edge_peek(app);
    if let Some(win) = app.get_webview_window("pet") {
        let _ = win.hide();
        let _ = win.set_ignore_cursor_events(true);
    }
    if let Ok(mut guard) = app.state::<AppState>().0.lock() {
        guard.ignored = true;
        guard.drag = None;
    }
    stop_input(app);
}

fn toggle_pet(app: &AppHandle) {
    let visible = app
        .get_webview_window("pet")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    if visible {
        hide_pet(app);
    } else {
        show_pet(app);
    }
}

fn ensure_menu_window(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(win) = app.get_webview_window("menu") {
        return Some(win);
    }
    let win = WebviewWindowBuilder::new(app, "menu", WebviewUrl::App("/src/renderer/menu.html".into()))
        .title("毛桃桌面宠物 · 控制面板")
        .inner_size(MENU_W, MENU_H)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        .visible(false)
        .build()
        .ok()?;
    let app_clone = app.clone();
    win.on_window_event(move |event| {
        if let WindowEvent::Focused(false) | WindowEvent::CloseRequested { .. } = event {
            if let Ok(mut g) = app_clone.state::<AppState>().0.lock() {
                g.menu_drag = None;
            }
        }
    });
    Some(win)
}

fn position_menu_near_cursor(app: &AppHandle, win: &WebviewWindow) {
    let cursor = win
        .cursor_position()
        .or_else(|_| {
            app.get_webview_window("pet")
                .map(|p| p.cursor_position())
                .unwrap_or(Ok(PhysicalPosition::new(600.0, 400.0)))
        })
        .unwrap_or(PhysicalPosition::new(600.0, 400.0));
    let (wx, wy, ww, wh, dpr) = monitor_work_area(win, "current", None);
    let mw = (MENU_W * dpr).round() as i32;
    let mh = (MENU_H * dpr).round() as i32;
    let pad = (8.0 * dpr).round() as i32;
    let mut x = (cursor.x - mw as f64 * 0.5).round() as i32;
    let mut y = (cursor.y - mh as f64 + 30.0 * dpr).round() as i32;
    if y < wy + pad {
        y = (cursor.y + 14.0 * dpr).round() as i32;
    }
    x = x.max(wx + pad).min(wx + ww - mw - pad);
    y = y.max(wy + pad).min(wy + wh - mh - pad);
    let _ = win.set_position(TauriPos::Physical(PhysicalPosition::new(x, y)));
}

fn show_menu_near(app: &AppHandle) {
    if let Some(win) = ensure_menu_window(app) {
        position_menu_near_cursor(app, &win);
        let _ = win.set_always_on_top(true);
        let _ = win.show();
        let _ = win.set_focus();
        push_menu_state(app);
    }
}

fn toggle_menu_near(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("menu") {
        if win.is_visible().unwrap_or(false) {
            if let Ok(mut g) = app.state::<AppState>().0.lock() {
                g.menu_drag = None;
            }
            let _ = win.hide();
            return;
        }
    }
    show_menu_near(app);
}

fn open_typing_window(app: &AppHandle) {
    show_pet(app);
    if let Some(win) = app.get_webview_window("typing") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "typing", WebviewUrl::App("/src/renderer/typing.html".into()))
        .title("毛桃 · 中英文试打")
        .inner_size(380.0, 178.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .build();
}

fn toggle_input(app: &AppHandle) {
    if !input_hook::unavailable_reason().is_empty() {
        return;
    }
    let standby = app.state::<AppState>().0.lock().unwrap().store.prefs.standby_mode;
    if standby {
        return;
    }
    if input_hook::is_active() {
        stop_input(app);
        return;
    }
    {
        let st = app.state::<AppState>();
        let mut g = st.0.lock().unwrap();
        if g.confirming_input {
            return;
        }
        g.confirming_input = true;
    }
    let app_clone = app.clone();
    app.dialog()
        .message("毛桃只用键鼠方向与类别播放动画，不读取或保存输入文字。隐藏宠物或退出时自动暂停。")
        .title("开启本次跨应用输入联动？")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom("开启联动".into(), "暂停".into()))
        .show(move |confirmed| {
            if let Ok(mut g) = app_clone.state::<AppState>().0.lock() {
                g.confirming_input = false;
            }
            if confirmed {
                let visible = app_clone
                    .get_webview_window("pet")
                    .and_then(|w| w.is_visible().ok())
                    .unwrap_or(false);
                if visible {
                    if input_hook::set_active(true).is_ok() {
                        let _ = app_clone.emit_to("pet", "pet:action", "input-on");
                    } else {
                        app_clone
                            .dialog()
                            .message("全局输入监听启动失败，请检查系统权限后重启应用。应用内互动仍可使用。")
                            .title("联动暂不可用")
                            .kind(MessageDialogKind::Warning)
                            .show(|_| {});
                    }
                }
            }
            push_menu_state(&app_clone);
        });
}

fn run_command(app: &AppHandle, cmd_type: &str, key: Option<&str>, value: Option<Value>) {
    match cmd_type {
        "set" => {
            if let (Some(k), Some(v)) = (key, value) {
                apply_set(app, k, v);
            }
        }
        "dock" => {
            if let Some(side) = value.and_then(|v| v.as_str().map(String::from)) {
                {
                    let st = app.state::<AppState>();
                    let mut g = st.0.lock().unwrap();
                    g.store.set_value("dock", Value::String(side));
                    g.store.set_value("position", Value::Null);
                }
                place_pet(app, "dock");
                send_prefs(app);
            }
        }
        "center" => {
            place_pet(app, "center");
            if let Some(win) = app.get_webview_window("pet") {
                if let (Ok(pos), Ok(size)) = (win.outer_position(), win.inner_size()) {
                    let st = app.state::<AppState>();
                    let mut g = st.0.lock().unwrap();
                    let origin = scene_origin_from_viewport(
                        Position { x: pos.x, y: pos.y },
                        size,
                        pet_viewport(g.store.prefs.keyboard),
                    );
                    g.store.set_value("position", serde_json::json!({ "x": origin.x, "y": origin.y }));
                }
            }
            show_pet(app);
        }
        "reset" => {
            {
                let st = app.state::<AppState>();
                let mut g = st.0.lock().unwrap();
                g.store.set_value("position", Value::Null);
            }
            place_pet(app, "primary");
            show_pet(app);
        }
        "toggle" => toggle_pet(app),
        "toggleInput" => toggle_input(app),
        "perform" => {
            if let Some(action) = value.and_then(|v| v.as_str().map(String::from)) {
                show_pet(app);
                let _ = app.emit_to("pet", "pet:action", action);
            }
        }
        "focusStart" => {
            {
                let st = app.state::<AppState>();
                let mut g = st.0.lock().unwrap();
                if g.pomodoro.phase == "idle" {
                    g.pomodoro.phase = "focus".into();
                    g.pomodoro.remaining_sec = g.store.prefs.focus_minutes.max(1) * 60;
                }
                g.pomodoro.paused = false;
                if g.store.prefs.standby_mode {
                    g.store.set_value("standbyMode", Value::Bool(false));
                }
                let is_focus = g.pomodoro.phase == "focus";
                g.store.set_value("focusMode", Value::Bool(is_focus));
            }
            send_prefs(app);
        }
        "focusPause" => {
            {
                let st = app.state::<AppState>();
                let mut g = st.0.lock().unwrap();
                if g.pomodoro.phase != "idle" {
                    g.pomodoro.paused = !g.pomodoro.paused;
                }
            }
            push_menu_state(app);
        }
        "focusSkip" => {
            let trigger_yarn = {
                let st = app.state::<AppState>();
                let mut g = st.0.lock().unwrap();
                if g.pomodoro.phase == "idle" {
                    false
                } else if g.pomodoro.phase == "focus" {
                    g.pomodoro.rounds += 1;
                    g.pomodoro.phase = "break".into();
                    g.pomodoro.remaining_sec = g.store.prefs.break_minutes.max(1) * 60;
                    g.pomodoro.paused = false;
                    g.store.set_value("focusMode", Value::Bool(false));
                    true
                } else {
                    g.pomodoro.phase = "focus".into();
                    g.pomodoro.remaining_sec = g.store.prefs.focus_minutes.max(1) * 60;
                    g.pomodoro.paused = false;
                    g.store.set_value("focusMode", Value::Bool(true));
                    false
                }
            };
            if trigger_yarn {
                let _ = app.emit_to("pet", "pet:action", "yarn");
            }
            send_prefs(app);
        }
        "focusReset" => {
            {
                let st = app.state::<AppState>();
                let mut g = st.0.lock().unwrap();
                g.pomodoro.phase = "idle".into();
                g.pomodoro.paused = false;
                g.pomodoro.remaining_sec = g.store.prefs.focus_minutes.max(1) * 60;
                if g.store.prefs.focus_mode {
                    g.store.set_value("focusMode", Value::Bool(false));
                }
            }
            send_prefs(app);
        }
        "typing" => open_typing_window(app),
        "quit" => {
            if let Ok(g) = app.state::<AppState>().0.lock() {
                g.store.flush();
            }
            app.exit(0);
        }
        _ => {}
    }
}

#[tauri::command]
fn pet_get_preferences(app: AppHandle) -> Preferences {
    app.state::<AppState>().0.lock().unwrap().store.prefs.clone()
}

#[tauri::command]
fn pet_set_mask(app: AppHandle, mask: Vec<u8>) {
    if mask.len() != MASK_W * MASK_H {
        return;
    }
    if let Ok(mut g) = app.state::<AppState>().0.lock() {
        g.mask = Some(mask);
    }
}

#[tauri::command]
fn pet_drag_start(app: AppHandle, point: PointArg) {
    if !point.x.is_finite() || !point.y.is_finite() || point.x < 0.0 || point.x > PET_W || point.y < 0.0 || point.y > PET_H {
        return;
    }
    let Some(win) = app.get_webview_window("pet") else {
        return;
    };
    let viewport = {
        let st = app.state::<AppState>();
        let Ok(g) = st.0.lock() else { return };
        pet_viewport(g.store.prefs.keyboard)
    };
    if point.x < viewport.0 || point.x > viewport.0 + viewport.2
        || point.y < viewport.1 || point.y > viewport.1 + viewport.3 {
        return;
    }
    if !win.is_visible().unwrap_or(false) {
        return;
    }
    let Ok(pos) = win.outer_position() else { return };
    let Ok(size) = win.inner_size() else { return };
    let cursor_x = pos.x as f64 + (point.x - viewport.0) * size.width as f64 / viewport.2;
    let cursor_y = pos.y as f64 + (point.y - viewport.1) * size.height as f64 / viewport.3;
    let _ = win.set_ignore_cursor_events(false);
    if let Ok(mut g) = app.state::<AppState>().0.lock() {
        g.ignored = false;
        g.drag = Some(PetDrag {
            cursor_x,
            cursor_y,
            win_x: pos.x,
            win_y: pos.y,
            win_w: size.width,
            win_h: size.height,
            from_edge_peek: false,
        });
    }
}

#[tauri::command]
fn pet_drag_start_from_edge_peek(app: AppHandle) {
    let peek = {
        let st = app.state::<AppState>();
        st.0.lock().ok().and_then(|mut g| g.edge_peek.take())
    };
    let Some(peek) = peek else { return; };
    let Some(win) = app.get_webview_window("pet") else { return; };
    if !win.is_visible().unwrap_or(false) { return; }
    let (Ok(cursor), Ok(size)) = (win.cursor_position(), win.inner_size()) else { return; };
    let _ = win.set_position(TauriPos::Physical(PhysicalPosition::new(peek.restore.x, peek.restore.y)));
    let _ = win.set_ignore_cursor_events(false);
    if let Ok(mut g) = app.state::<AppState>().0.lock() {
        g.ignored = false;
        g.edge_peek_press_held = false;
        g.last_cursor = None;
        g.drag = Some(PetDrag {
            cursor_x: cursor.x,
            cursor_y: cursor.y,
            win_x: peek.restore.x,
            win_y: peek.restore.y,
            win_w: size.width,
            win_h: size.height,
            from_edge_peek: true,
        });
    }
    let _ = app.emit_to("pet", "pet:edge-peek", Value::Null);
}

#[tauri::command]
fn pet_edge_peek_press(app: AppHandle, held: bool) {
    let Some(win) = app.get_webview_window("pet") else { return; };
    let needs_unignore = {
        let st = app.state::<AppState>();
        let Ok(mut g) = st.0.lock() else { return; };
        if g.edge_peek.is_none() { return; }
        g.edge_peek_press_held = held;
        if !held { g.last_cursor = None; }
        let needs_unignore = held && g.ignored;
        if needs_unignore { g.ignored = false; }
        needs_unignore
    };
    if needs_unignore {
        let _ = win.set_ignore_cursor_events(false);
    }
}

#[tauri::command]
fn pet_drag_end(app: AppHandle) {
    let drag = {
        let st = app.state::<AppState>();
        let mut g = st.0.lock().unwrap();
        g.drag.take()
    };
    let Some(drag) = drag else { return; };
    let Some(win) = app.get_webview_window("pet") else { return; };
    let (Ok(pos), Ok(size)) = (win.outer_position(), win.inner_size()) else { return; };
    if drag.from_edge_peek {
        let cursor = win.cursor_position().ok();
        if cursor.map_or(true, |point| (point.x - drag.cursor_x).hypot(point.y - drag.cursor_y) < 20.0) {
            if let Ok(mut g) = app.state::<AppState>().0.lock() {
                let origin = scene_origin_from_viewport(
                    Position { x: pos.x, y: pos.y },
                    size,
                    pet_viewport(g.store.prefs.keyboard),
                );
                g.store.set_value("position", serde_json::json!({ "x": origin.x, "y": origin.y }));
            }
            return;
        }
    }
    let (wx, wy, ww, wh, dpr) = monitor_work_area_for_rect(&win, pos.x, pos.y, size.width, size.height);
    let actual = Position { x: pos.x, y: pos.y };
    let viewport = {
        let st = app.state::<AppState>();
        let guard = st.0.lock().unwrap();
        pet_viewport(guard.store.prefs.keyboard)
    };
    let restore = scene_origin_from_viewport(actual.clone(), size, viewport);
    let threshold = (26.0 * dpr).round() as i32;
    let left_gap = (pos.x - wx).abs();
    let right_gap = (wx + ww - (pos.x + size.width as i32)).abs();
    let side = match (left_gap <= threshold, right_gap <= threshold) {
        (true, true) => Some(if left_gap <= right_gap { "left" } else { "right" }),
        (true, false) => Some("left"),
        (false, true) => Some("right"),
        (false, false) => None,
    };
    {
        let st = app.state::<AppState>();
        if let Ok(mut g) = st.0.lock() {
            g.store.set_value("position", serde_json::json!({ "x": restore.x, "y": restore.y }));
            if let Some(side) = side {
                g.edge_peek = Some(EdgePeek {
                    side: side.to_string(),
                    restore: actual.clone(),
                    work_area: (wx, wy, ww, wh),
                });
                g.last_cursor = None;
            }
        }
    }
    if let Some(side) = side {
        let visible = scaled_peek_visible_width(size.width, side, viewport);
        let target_x = if side == "left" { wx - size.width as i32 + visible } else { wx + ww - visible };
        let target_y = actual.y.clamp(wy, wy + (wh - size.height as i32).max(0));
        let target = Position { x: target_x, y: target_y };
        let _ = app.emit_to("pet", "pet:edge-peek", side);
        animate_pet_position(app, actual, target, side.to_string());
    }
}

fn animate_pet_position(app: AppHandle, from: Position, to: Position, side: String) {
    std::thread::spawn(move || {
        const STEPS: i32 = 15;
        for step in 1..=STEPS {
            std::thread::sleep(Duration::from_millis(16));
            let still_peeking = app.state::<AppState>().0.lock().ok()
                .and_then(|g| g.edge_peek.as_ref().map(|peek| peek.side == side))
                .unwrap_or(false);
            if !still_peeking { return; }
            let t = step as f64 / STEPS as f64;
            let eased = t * t * (3.0 - 2.0 * t);
            let x = (from.x as f64 + (to.x - from.x) as f64 * eased).round() as i32;
            let y = (from.y as f64 + (to.y - from.y) as f64 * eased).round() as i32;
            if let Some(win) = app.get_webview_window("pet") {
                let _ = win.set_position(TauriPos::Physical(PhysicalPosition::new(x, y)));
            }
        }
    });
}

fn restore_edge_peek(app: &AppHandle) {
    let peek = {
        let st = app.state::<AppState>();
        st.0.lock().ok().and_then(|mut g| g.edge_peek.take())
    };
    let Some(peek) = peek else { return; };
    if let Some(win) = app.get_webview_window("pet") {
        let _ = win.set_position(TauriPos::Physical(PhysicalPosition::new(peek.restore.x, peek.restore.y)));
        let _ = win.set_ignore_cursor_events(false);
    }
    if let Ok(mut g) = app.state::<AppState>().0.lock() {
        g.ignored = false;
        g.edge_peek_press_held = false;
        g.last_cursor = None;
    }
    let _ = app.emit_to("pet", "pet:edge-peek", Value::Null);
}

#[tauri::command]
fn pet_exit_edge_peek(app: AppHandle) {
    restore_edge_peek(&app);
}

#[tauri::command]
async fn pet_open_menu(app: AppHandle) {
    toggle_menu_near(&app);
}

#[tauri::command]
fn pet_count(app: AppHandle, kind: String) {
    if let Ok(mut g) = app.state::<AppState>().0.lock() {
        g.store.count(&kind);
    }
}

#[tauri::command]
fn pet_finish_focus(app: AppHandle) {
    let changed = {
        let st = app.state::<AppState>();
        let mut g = st.0.lock().unwrap();
        if g.store.prefs.focus_mode {
            g.store.set_value("focusMode", Value::Bool(false));
            true
        } else {
            false
        }
    };
    if changed {
        send_prefs(&app);
    }
}

#[tauri::command]
fn try_key(app: AppHandle, input: TryKeyArg) {
    if input.code.len() > 32 || input.key.len() > 12 {
        return;
    }
    let standby = {
        let st = app.state::<AppState>();
        let mut g = st.0.lock().unwrap();
        if g.store.prefs.standby_mode {
            true
        } else {
            g.store.count("keys");
            false
        }
    };
    if !standby {
        let _ = app.emit_to(
            "pet",
            "pet:input",
            LocalInputPayload {
                kind: "local",
                code: input.code,
                key: input.key,
            },
        );
    }
}

#[tauri::command]
fn menu_get_state(app: AppHandle) -> MenuStateSnapshot {
    build_menu_state(&app)
}

#[tauri::command]
async fn menu_command(app: AppHandle, cmd: MenuCommand) {
    run_command(&app, &cmd.cmd_type, cmd.key.as_deref(), cmd.value);
    push_menu_state(&app);
}

#[tauri::command]
fn menu_set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> {
    set_launch_at_startup(&app, enabled)
}

#[tauri::command]
fn menu_drag_start(app: AppHandle) {
    let Some(win) = app.get_webview_window("menu") else {
        return;
    };
    let (Ok(cursor), Ok(pos)) = (win.cursor_position(), win.outer_position()) else {
        return;
    };
    if let Ok(mut g) = app.state::<AppState>().0.lock() {
        g.menu_drag = Some(MenuDrag {
            dx: pos.x as f64 - cursor.x,
            dy: pos.y as f64 - cursor.y,
        });
    }
}

#[tauri::command]
fn menu_drag_end(app: AppHandle) {
    if let Ok(mut g) = app.state::<AppState>().0.lock() {
        g.menu_drag = None;
    }
}

#[tauri::command]
fn menu_close(app: AppHandle) {
    if let Ok(mut g) = app.state::<AppState>().0.lock() {
        g.menu_drag = None;
    }
    if let Some(win) = app.get_webview_window("menu") {
        let _ = win.hide();
    }
}

fn handle_tray_menu_click(app: &AppHandle, id: &str) {
    if let Some(rest) = id.strip_prefix("set:") {
        if let Some((key, val)) = rest.split_once(':') {
            apply_set(app, key, Value::String(val.to_string()));
        }
    } else if let Some(rest) = id.strip_prefix("setnum:") {
        if let Some((key, val)) = rest.split_once(':') {
            if let Ok(num) = val.parse::<f64>() {
                apply_set(app, key, Value::from(num));
            }
        }
    } else if let Some(rest) = id.strip_prefix("setu32:") {
        if let Some((key, val)) = rest.split_once(':') {
            if let Ok(num) = val.parse::<u32>() {
                apply_set(app, key, Value::from(num));
            }
        }
    } else if let Some(key) = id.strip_prefix("toggle:") {
        let next = {
            let st = app.state::<AppState>();
            let g = st.0.lock().unwrap();
            match key {
                "focusMode" => !g.store.prefs.focus_mode,
                "privacyMode" => !g.store.prefs.privacy_mode,
                "clickThrough" => !g.store.prefs.click_through,
                "keyboard" => !g.store.prefs.keyboard,
                "leftMouse" => !g.store.prefs.left_mouse,
                "numpad" => !g.store.prefs.numpad,
                "top" => !g.store.prefs.top,
                "hideOnClose" => !g.store.prefs.hide_on_close,
                "sound" => !g.store.prefs.sound,
                "keySound" => !g.store.prefs.key_sound,
                _ => return,
            }
        };
        apply_set(app, key, Value::Bool(next));
    } else if let Some(action) = id.strip_prefix("perform:") {
        run_command(app, "perform", None, Some(Value::String(action.to_string())));
    } else if let Some(side) = id.strip_prefix("dock:") {
        run_command(app, "dock", None, Some(Value::String(side.to_string())));
    } else if let Some(act) = id.strip_prefix("action:") {
        match act {
            "openMenu" => show_menu_near(app),
            _ => run_command(app, act, None, None),
        }
    }
}

fn start_poll_thread(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(16));

        // 1. Handle menu window drag
        let menu_drag = app.state::<AppState>().0.lock().ok().and_then(|g| g.menu_drag.clone());
        if let Some(md) = menu_drag {
            if let Some(mwin) = app.get_webview_window("menu") {
                if let Ok(cursor) = mwin.cursor_position() {
                    let nx = (cursor.x + md.dx).round() as i32;
                    let ny = (cursor.y + md.dy).round() as i32;
                    if let Ok(cur) = mwin.outer_position() {
                        if cur.x != nx || cur.y != ny {
                            let _ = mwin.set_position(TauriPos::Physical(PhysicalPosition::new(nx, ny)));
                        }
                    }
                }
            }
        }

        // 2. Handle pet window drag & pixel-accurate hit-mask click-through
        let Some(pet_win) = app.get_webview_window("pet") else {
            continue;
        };
        if !pet_win.is_visible().unwrap_or(false) {
            continue;
        }
        let Ok(cursor) = pet_win.cursor_position() else {
            continue;
        };

        let pet_drag = app.state::<AppState>().0.lock().ok().and_then(|g| g.drag.clone());
        if let Some(d) = pet_drag {
            // Pick the display under the global cursor on every drag tick. Keeping
            // the window's original display here traps it at that display's edge.
            let (wx, wy, ww, wh, _) = monitor_work_area_at(&pet_win, cursor.x, cursor.y);
            let target_x = (d.win_x as f64 + cursor.x - d.cursor_x).round() as i32;
            let target_y = (d.win_y as f64 + cursor.y - d.cursor_y).round() as i32;
            let (nx, ny) = fit_position(target_x, target_y, d.win_w as i32, d.win_h as i32, wx, wy, ww, wh);
            if let Ok(cur) = pet_win.outer_position() {
                if cur.x != nx || cur.y != ny {
                    let _ = pet_win.set_position(TauriPos::Physical(PhysicalPosition::new(nx, ny)));
                    let _ = app.emit_to(
                        "pet",
                        "pet:drag-move",
                        DragMovePayload {
                            dx: nx - cur.x,
                            dy: ny - cur.y,
                        },
                    );
                }
            }
            continue;
        }

        let press_held = app.state::<AppState>().0.lock().ok()
            .map(|g| g.edge_peek.is_some() && g.edge_peek_press_held)
            .unwrap_or(false);
        if press_held {
            continue;
        }

        let (Ok(pos), Ok(size)) = (pet_win.outer_position(), pet_win.inner_size()) else {
            continue;
        };
        if size.width == 0 || size.height == 0 {
            continue;
        }
        let viewport = app.state::<AppState>().0.lock().ok()
            .map(|g| pet_viewport(g.store.prefs.keyboard))
            .unwrap_or((0.0, 0.0, PET_W, PET_H));
        let local_x = cursor.x - pos.x as f64;
        let local_y = cursor.y - pos.y as f64;
        let x = viewport.0 + local_x * viewport.2 / size.width as f64;
        let y = viewport.1 + local_y * viewport.3 / size.height as f64;
        let inside = local_x >= 0.0 && local_x < size.width as f64
            && local_y >= 0.0 && local_y < size.height as f64;

        let (need_ignore_change, next_ignore, emit_cursor) = {
            let st = app.state::<AppState>();
            let Ok(mut g) = st.0.lock() else { continue };
            let hit = if inside {
                let col = (x / 4.0).floor() as usize;
                let row = (y / 4.0).floor() as usize;
                let idx = row * MASK_W + col;
                g.mask.as_ref().and_then(|m| m.get(idx).copied()).unwrap_or(0) != 0
            } else {
                false
            };
            let on_occupied_display = g.edge_peek.as_ref().map_or(true, |peek| {
                let (wx, _, ww, _, _) = peek.work_area;
                let boundary = if peek.side == "right" { wx + ww - pos.x } else { wx - pos.x };
                let logical_boundary = viewport.0 + boundary as f64 * viewport.2 / size.width as f64;
                if peek.side == "right" { x < logical_boundary } else { x >= logical_boundary }
            });
            let inside_pet = inside && on_occupied_display;
            let next_ignore = g.store.prefs.click_through || !inside_pet || !hit;
            let changed = g.ignored != next_ignore;
            if changed {
                g.ignored = next_ignore;
            }
            let moved = g.last_cursor.map_or(true, |(lx, ly)| (lx - x).abs() > 0.25 || (ly - y).abs() > 0.25);
            let emit = if moved && g.last_sent.elapsed() >= Duration::from_millis(16) {
                g.last_cursor = Some((x, y));
                g.last_sent = Instant::now();
                true
            } else {
                false
            };
            (changed, next_ignore, emit)
        };

        if need_ignore_change {
            let _ = pet_win.set_ignore_cursor_events(next_ignore);
        }
        if emit_cursor {
            let _ = app.emit_to(
                "pet",
                "pet:cursor",
                CursorPayload {
                    x,
                    y,
                    inside: inside_pet,
                    screen_x: cursor.x,
                    screen_y: cursor.y,
                },
            );
        }
    });
}

fn start_pomodoro_thread(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));
        let (ticked, phase_changed, trigger_yarn, prefs_snapshot) = {
            let st = app.state::<AppState>();
            let Ok(mut g) = st.0.lock() else { continue };
            if g.pomodoro.phase == "idle" || g.pomodoro.paused {
                continue;
            }
            g.pomodoro.remaining_sec = g.pomodoro.remaining_sec.saturating_sub(1);
            if g.pomodoro.remaining_sec == 0 {
                if g.pomodoro.phase == "focus" {
                    g.pomodoro.rounds += 1;
                    g.pomodoro.phase = "break".into();
                    g.pomodoro.remaining_sec = g.store.prefs.break_minutes.max(1) * 60;
                    g.store.set_value("focusMode", Value::Bool(false));
                    (true, true, true, Some(g.store.prefs.clone()))
                } else {
                    g.pomodoro.phase = "focus".into();
                    g.pomodoro.remaining_sec = g.store.prefs.focus_minutes.max(1) * 60;
                    g.store.set_value("focusMode", Value::Bool(true));
                    (true, true, false, Some(g.store.prefs.clone()))
                }
            } else {
                (true, false, false, None)
            }
        };
        if phase_changed {
            if let Some(prefs) = prefs_snapshot {
                let _ = app.emit_to("pet", "pet:preferences", &prefs);
            }
            if trigger_yarn {
                let _ = app.emit_to("pet", "pet:action", "yarn");
            }
        }
        if ticked {
            push_menu_state(&app);
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if app.get_webview_window("pet").is_some() {
                show_pet(app);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let s = shortcut.to_string().to_lowercase();
                    if s.contains("keyp") || s.ends_with("+p") {
                        let next = !app.state::<AppState>().0.lock().unwrap().store.prefs.privacy_mode;
                        apply_set(app, "privacyMode", Value::Bool(next));
                    } else if s.contains("keyl") || s.ends_with("+l") {
                        let next = !app.state::<AppState>().0.lock().unwrap().store.prefs.click_through;
                        apply_set(app, "clickThrough", Value::Bool(next));
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            pet_get_preferences,
            pet_set_mask,
            pet_drag_start,
            pet_drag_start_from_edge_peek,
            pet_edge_peek_press,
            pet_drag_end,
            pet_exit_edge_peek,
            pet_open_menu,
            pet_count,
            pet_finish_focus,
            try_key,
            menu_get_state,
            menu_command,
            menu_set_autostart,
            menu_drag_start,
            menu_drag_end,
            menu_close,
        ])
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("maotao-desktop-pet"));
            let mut store = SettingsStore::load(&data_dir);
            if store.prefs.launch_at_startup && app.autolaunch().enable().is_err() {
                store.set_value("launchAtStartup", Value::Bool(false));
            }
            let focus_min = store.prefs.focus_minutes;
            let standby = store.prefs.standby_mode;
            let privacy = store.prefs.privacy_mode;
            let initial_prefs = store.prefs.clone();

            app.manage(AppState(Mutex::new(InnerState {
                store,
                pomodoro: PomodoroState::new(focus_min),
                mask: None,
                ignored: true,
                drag: None,
                edge_peek: None,
                edge_peek_press_held: false,
                menu_drag: None,
                menu_positioned: false,
                last_cursor: None,
                last_sent: Instant::now(),
                confirming_input: false,
            })));

            input_hook::set_privacy(privacy);

            // WebView2 can invoke frontend commands while a window is being created.
            // Register AppState before creating either configured window.
            for config in &app.config().app.windows {
                WebviewWindowBuilder::from_config(app.handle(), config)?.build()?;
            }

            // Init global input hook
            let hook_app = app.handle().clone();
            input_hook::init_hook(move |payload| {
                let is_local = {
                    let pet_win = hook_app.get_webview_window("pet");
                    let typing_focused = hook_app
                        .get_webview_window("typing")
                        .and_then(|w| w.is_focused().ok())
                        .unwrap_or(false);
                    if payload.kind == "mouse" {
                        let ignored = hook_app
                            .state::<AppState>()
                            .0
                            .lock()
                            .map(|g| g.ignored)
                            .unwrap_or(true);
                        !ignored || typing_focused
                    } else {
                        let pet_focused = pet_win
                            .and_then(|w| w.is_focused().ok())
                            .unwrap_or(false);
                        pet_focused || typing_focused
                    }
                };
                if is_local {
                    return;
                }
                let standby_now = {
                    let st = hook_app.state::<AppState>();
                    let Ok(mut g) = st.0.lock() else { return };
                    if g.store.prefs.standby_mode {
                        true
                    } else {
                        g.store.count(if payload.kind == "mouse" { "clicks" } else { "keys" });
                        false
                    }
                };
                if !standby_now {
                    let _ = hook_app.emit_to("pet", "pet:input", &payload);
                }
            });

            if !standby && input_hook::unavailable_reason().is_empty() {
                let _ = input_hook::set_active(true);
            }

            // Setup pet window placement & close behavior
            let handle = app.handle().clone();
            place_pet(&handle, "restore");
            if let Some(pet_win) = app.get_webview_window("pet") {
                let _ = pet_win.set_ignore_cursor_events(true);
                let _ = pet_win.set_visible_on_all_workspaces(true);
                let _ = pet_win.show();
                let _ = pet_win.set_always_on_top(initial_prefs.top);
                let close_app = handle.clone();
                pet_win.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        let hide = close_app
                            .state::<AppState>()
                            .0
                            .lock()
                            .map(|g| g.store.prefs.hide_on_close)
                            .unwrap_or(true);
                        if hide {
                            api.prevent_close();
                            hide_pet(&close_app);
                        }
                    }
                    WindowEvent::Focused(false) => {
                        if let Ok(mut g) = close_app.state::<AppState>().0.lock() {
                            g.drag = None;
                        }
                    }
                    _ => {}
                });
            }
            if let Some(menu_win) = app.get_webview_window("menu") {
                let m_app = handle.clone();
                menu_win.on_window_event(move |event| match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        if let Some(w) = m_app.get_webview_window("menu") {
                            let _ = w.hide();
                        }
                    }
                    WindowEvent::Focused(false) => {
                        if let Ok(mut g) = m_app.state::<AppState>().0.lock() {
                            g.menu_drag = None;
                        }
                    }
                    _ => {}
                });
            }

            // Setup native tray icon & menu
            let tray_menu = tray::build_tray_menu(
                &handle,
                &initial_prefs,
                input_hook::is_active(),
                true,
                input_hook::unavailable_reason(),
                input_hook::is_wayland_session(),
            )?;
            let tray_img = Image::from_bytes(include_bytes!("../icons/tray.png"))?;
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(tray_img)
                .tooltip("毛桃桌面宠物")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    handle_tray_menu_click(app, event.id().as_ref());
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_pet(tray.app_handle());
                    }
                })
                .build(app)?;

            // Register best-effort global shortcuts
            let _ = app.global_shortcut().register("Alt+Shift+P");
            let _ = app.global_shortcut().register("Alt+Shift+L");

            // Start 60fps cursor/drag/hit-mask poller & 1Hz Pomodoro thread
            start_poll_thread(handle.clone());
            start_pomodoro_thread(handle);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MAOTAO Desktop Pet");
}
