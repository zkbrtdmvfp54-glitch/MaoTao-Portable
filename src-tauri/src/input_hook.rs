use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

#[derive(Debug, Clone, Serialize)]
pub struct InputPayload {
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub side: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<&'static str>,
}

type Callback = Box<dyn Fn(InputPayload) + Send + Sync>;

static ACTIVE: AtomicBool = AtomicBool::new(false);
static PRIVACY: AtomicBool = AtomicBool::new(false);
static FAILED: AtomicBool = AtomicBool::new(false);
static STARTED: AtomicBool = AtomicBool::new(false);
static CALLBACK: OnceLock<Callback> = OnceLock::new();
static THROTTLE: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();

pub fn is_wayland_session() -> bool {
    #[cfg(target_os = "linux")]
    {
        let session = std::env::var("XDG_SESSION_TYPE").unwrap_or_default();
        if session.eq_ignore_ascii_case("wayland") {
            return true;
        }
        std::env::var("WAYLAND_DISPLAY").is_ok() && std::env::var("DISPLAY").is_err()
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

pub fn unavailable_reason() -> &'static str {
    if is_wayland_session() {
        return "当前桌面使用 Wayland，会话安全策略不允许此程序读取其他应用的全局键鼠事件。请登录 X11 会话后再启用。";
    }
    if FAILED.load(Ordering::Relaxed) {
        return "输入监听启动失败；请检查系统权限后重启应用。";
    }
    ""
}

pub fn set_privacy(enabled: bool) {
    PRIVACY.store(enabled, Ordering::Relaxed);
}

pub fn is_active() -> bool {
    ACTIVE.load(Ordering::Relaxed)
}

pub fn set_active(enabled: bool) -> Result<(), &'static str> {
    if !enabled {
        ACTIVE.store(false, Ordering::Relaxed);
        return Ok(());
    }
    if is_wayland_session() {
        return Err("Wayland 会话暂不支持全局输入联动。");
    }
    if FAILED.load(Ordering::Relaxed) {
        return Err("全局输入监听不可用，请检查系统权限后重启。");
    }
    ACTIVE.store(true, Ordering::Relaxed);
    Ok(())
}

pub fn init_hook<F>(on_input: F)
where
    F: Fn(InputPayload) + Send + Sync + 'static,
{
    let _ = CALLBACK.set(Box::new(on_input));
    let _ = THROTTLE.set(Mutex::new(HashMap::new()));
    if is_wayland_session() {
        return;
    }
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        platform::run_loop();
    });
}

fn dispatch(payload: InputPayload, min_interval_ms: u128) {
    if !ACTIVE.load(Ordering::Relaxed) {
        return;
    }
    let key = format!(
        "{}:{}:{}:{}",
        payload.kind,
        payload.code.unwrap_or(""),
        payload.side.unwrap_or(""),
        payload.category.unwrap_or("")
    );
    let now = Instant::now();
    if let Some(lock) = THROTTLE.get() {
        if let Ok(mut map) = lock.lock() {
            if let Some(prev) = map.get(&key) {
                if now.duration_since(*prev).as_millis() < min_interval_ms {
                    return;
                }
            }
            map.insert(key, now);
        }
    }
    if let Some(cb) = CALLBACK.get() {
        cb(payload);
    }
}

fn emit_key(code: &'static str, label: &'static str, is_right: bool, is_number: bool) {
    let privacy = PRIVACY.load(Ordering::Relaxed);
    if code == "Space" {
        dispatch(
            InputPayload {
                kind: "key",
                category: Some("space"),
                side: None,
                code: if privacy { None } else { Some("Space") },
                label: if privacy { None } else { Some("Space") },
            },
            20,
        );
        return;
    }
    dispatch(
        InputPayload {
            kind: "key",
            category: Some(if is_number { "number" } else { "key" }),
            side: Some(if is_right { "right" } else { "left" }),
            code: if privacy { None } else { Some(code) },
            label: if privacy { None } else { Some(label) },
        },
        20,
    );
}

fn emit_mouse(right: bool) {
    dispatch(
        InputPayload {
            kind: "mouse",
            category: None,
            side: Some(if right { "right" } else { "left" }),
            code: None,
            label: None,
        },
        45,
    );
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{emit_key, emit_mouse, FAILED};
    use std::ptr::null_mut;
    use std::sync::atomic::Ordering;
    use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, GetMessageW, SetWindowsHookExW, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL,
        WH_MOUSE_LL, WM_KEYDOWN, WM_LBUTTONDOWN, WM_RBUTTONDOWN, WM_SYSKEYDOWN,
    };

    fn map_vk(vk: u32) -> Option<(&'static str, &'static str, bool, bool)> {
        let mapped = match vk {
            0x41 => ("KeyA", "A", false, false),
            0x42 => ("KeyB", "B", false, false),
            0x43 => ("KeyC", "C", false, false),
            0x44 => ("KeyD", "D", false, false),
            0x45 => ("KeyE", "E", false, false),
            0x46 => ("KeyF", "F", false, false),
            0x47 => ("KeyG", "G", false, false),
            0x48 => ("KeyH", "H", true, false),
            0x49 => ("KeyI", "I", true, false),
            0x4A => ("KeyJ", "J", true, false),
            0x4B => ("KeyK", "K", true, false),
            0x4C => ("KeyL", "L", true, false),
            0x4D => ("KeyM", "M", true, false),
            0x4E => ("KeyN", "N", true, false),
            0x4F => ("KeyO", "O", true, false),
            0x50 => ("KeyP", "P", true, false),
            0x51 => ("KeyQ", "Q", false, false),
            0x52 => ("KeyR", "R", false, false),
            0x53 => ("KeyS", "S", false, false),
            0x54 => ("KeyT", "T", false, false),
            0x55 => ("KeyU", "U", true, false),
            0x56 => ("KeyV", "V", false, false),
            0x57 => ("KeyW", "W", false, false),
            0x58 => ("KeyX", "X", false, false),
            0x59 => ("KeyY", "Y", true, false),
            0x5A => ("KeyZ", "Z", false, false),
            0x30 => ("Digit0", "0", true, true),
            0x31 => ("Digit1", "1", false, true),
            0x32 => ("Digit2", "2", false, true),
            0x33 => ("Digit3", "3", false, true),
            0x34 => ("Digit4", "4", false, true),
            0x35 => ("Digit5", "5", false, true),
            0x36 => ("Digit6", "6", true, true),
            0x37 => ("Digit7", "7", true, true),
            0x38 => ("Digit8", "8", true, true),
            0x39 => ("Digit9", "9", true, true),
            0x60 => ("Numpad0", "0", true, true),
            0x61 => ("Numpad1", "1", true, true),
            0x62 => ("Numpad2", "2", true, true),
            0x63 => ("Numpad3", "3", true, true),
            0x64 => ("Numpad4", "4", true, true),
            0x65 => ("Numpad5", "5", true, true),
            0x66 => ("Numpad6", "6", true, true),
            0x67 => ("Numpad7", "7", true, true),
            0x68 => ("Numpad8", "8", true, true),
            0x69 => ("Numpad9", "9", true, true),
            0x20 => ("Space", "Space", false, false),
            0x0D => ("Enter", "⏎", true, false),
            0x08 => ("Backspace", "⌫", true, false),
            0x09 => ("Tab", "Tab", false, false),
            0x1B => ("Escape", "Esc", false, false),
            0x14 => ("CapsLock", "Caps", false, false),
            0xA0 => ("ShiftLeft", "Shift", false, false),
            0xA1 => ("ShiftRight", "Shift", true, false),
            0xA2 => ("ControlLeft", "Ctrl", false, false),
            0xA3 => ("ControlRight", "Ctrl", true, false),
            0xA4 => ("AltLeft", "Alt", false, false),
            0xA5 => ("AltRight", "Alt", true, false),
            0x5B => ("MetaLeft", "Win", false, false),
            0x5C => ("MetaRight", "Win", true, false),
            0xBD => ("Minus", "-", true, false),
            0xBB => ("Equal", "=", true, false),
            0xC0 => ("Backquote", "`", false, false),
            0xDB => ("BracketLeft", "[", true, false),
            0xDD => ("BracketRight", "]", true, false),
            0xDC => ("Backslash", "\\", true, false),
            0xBA => ("Semicolon", ";", true, false),
            0xDE => ("Quote", "'", true, false),
            0xBC => ("Comma", ",", true, false),
            0xBE => ("Period", ".", true, false),
            0xBF => ("Slash", "/", true, false),
            0x2E => ("Delete", "Del", true, false),
            0x26 => ("ArrowUp", "↑", true, false),
            0x28 => ("ArrowDown", "↓", true, false),
            0x25 => ("ArrowLeft", "←", false, false),
            0x27 => ("ArrowRight", "→", true, false),
            _ => ("", "", false, false),
        };
        if mapped.0.is_empty() {
            None
        } else {
            Some(mapped)
        }
    }

    unsafe extern "system" fn kb_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 && (wparam as u32 == WM_KEYDOWN || wparam as u32 == WM_SYSKEYDOWN) {
            let kb = &*(lparam as *const KBDLLHOOKSTRUCT);
            if let Some((c, lbl, right, num)) = map_vk(kb.vkCode) {
                emit_key(c, lbl, right, num);
            } else {
                emit_key("KeyA", "•", false, false);
            }
        }
        CallNextHookEx(null_mut(), code, wparam, lparam)
    }

    unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            match wparam as u32 {
                WM_LBUTTONDOWN => emit_mouse(false),
                WM_RBUTTONDOWN => emit_mouse(true),
                _ => {}
            }
        }
        CallNextHookEx(null_mut(), code, wparam, lparam)
    }

    pub fn run_loop() {
        unsafe {
            let hmod = GetModuleHandleW(null_mut());
            let hk_kb = SetWindowsHookExW(WH_KEYBOARD_LL, Some(kb_proc), hmod, 0);
            let hk_ms = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_proc), hmod, 0);
            if hk_kb.is_null() || hk_ms.is_null() {
                FAILED.store(true, Ordering::Relaxed);
                return;
            }
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {}
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{emit_key, emit_mouse, FAILED};
    use std::ffi::c_void;
    use std::ptr::null_mut;
    use std::sync::atomic::Ordering;

    type CFMachPortRef = *mut c_void;
    type CFRunLoopSourceRef = *mut c_void;
    type CFRunLoopRef = *mut c_void;
    type CFStringRef = *const c_void;
    type CGEventTapProxy = *mut c_void;
    type CGEventRef = *mut c_void;
    type CGEventType = u32;
    type CGEventMask = u64;

    const K_CG_SESSION_EVENT_TAP: u32 = 1;
    const K_CG_HEAD_INSERT_EVENT_TAP: u32 = 0;
    const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: u32 = 1;
    const K_CG_EVENT_LEFT_MOUSE_DOWN: u32 = 1;
    const K_CG_EVENT_RIGHT_MOUSE_DOWN: u32 = 3;
    const K_CG_EVENT_KEY_DOWN: u32 = 10;
    const K_CG_KEYBOARD_EVENT_KEYCODE: u32 = 9;

    type CGEventTapCallBack = extern "C" fn(
        proxy: CGEventTapProxy,
        event_type: CGEventType,
        event: CGEventRef,
        user_info: *mut c_void,
    ) -> CGEventRef;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventTapCreate(
            tap: u32,
            place: u32,
            options: u32,
            events_of_interest: CGEventMask,
            callback: CGEventTapCallBack,
            user_info: *mut c_void,
        ) -> CFMachPortRef;
        fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
        fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        static kCFRunLoopCommonModes: CFStringRef;
        fn CFMachPortCreateRunLoopSource(
            allocator: *const c_void,
            port: CFMachPortRef,
            order: isize,
        ) -> CFRunLoopSourceRef;
        fn CFRunLoopGetCurrent() -> CFRunLoopRef;
        fn CFRunLoopAddSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
        fn CFRunLoopRun();
    }

    fn map_mac_keycode(kc: i64) -> Option<(&'static str, &'static str, bool, bool)> {
        let m = match kc {
            0 => ("KeyA", "A", false, false),
            1 => ("KeyS", "S", false, false),
            2 => ("KeyD", "D", false, false),
            3 => ("KeyF", "F", false, false),
            4 => ("KeyH", "H", true, false),
            5 => ("KeyG", "G", false, false),
            6 => ("KeyZ", "Z", false, false),
            7 => ("KeyX", "X", false, false),
            8 => ("KeyC", "C", false, false),
            9 => ("KeyV", "V", false, false),
            11 => ("KeyB", "B", false, false),
            12 => ("KeyQ", "Q", false, false),
            13 => ("KeyW", "W", false, false),
            14 => ("KeyE", "E", false, false),
            15 => ("KeyR", "R", false, false),
            16 => ("KeyY", "Y", true, false),
            17 => ("KeyT", "T", false, false),
            18 => ("Digit1", "1", false, true),
            19 => ("Digit2", "2", false, true),
            20 => ("Digit3", "3", false, true),
            21 => ("Digit4", "4", false, true),
            22 => ("Digit6", "6", true, true),
            23 => ("Digit5", "5", false, true),
            24 => ("Equal", "=", true, false),
            25 => ("Digit9", "9", true, true),
            26 => ("Digit7", "7", true, true),
            27 => ("Minus", "-", true, false),
            28 => ("Digit8", "8", true, true),
            29 => ("Digit0", "0", true, true),
            30 => ("BracketRight", "]", true, false),
            31 => ("KeyO", "O", true, false),
            32 => ("KeyU", "U", true, false),
            33 => ("BracketLeft", "[", true, false),
            34 => ("KeyI", "I", true, false),
            35 => ("KeyP", "P", true, false),
            36 => ("Enter", "⏎", true, false),
            37 => ("KeyL", "L", true, false),
            38 => ("KeyJ", "J", true, false),
            39 => ("Quote", "'", true, false),
            40 => ("KeyK", "K", true, false),
            41 => ("Semicolon", ";", true, false),
            42 => ("Backslash", "\\", true, false),
            43 => ("Comma", ",", true, false),
            44 => ("Slash", "/", true, false),
            45 => ("KeyN", "N", true, false),
            46 => ("KeyM", "M", true, false),
            47 => ("Period", ".", true, false),
            48 => ("Tab", "Tab", false, false),
            49 => ("Space", "Space", false, false),
            50 => ("Backquote", "`", false, false),
            51 => ("Backspace", "⌫", true, false),
            53 => ("Escape", "Esc", false, false),
            123 => ("ArrowLeft", "←", false, false),
            124 => ("ArrowRight", "→", true, false),
            125 => ("ArrowDown", "↓", true, false),
            126 => ("ArrowUp", "↑", true, false),
            _ => return None,
        };
        Some(m)
    }

    extern "C" fn tap_callback(
        _proxy: CGEventTapProxy,
        event_type: CGEventType,
        event: CGEventRef,
        _user_info: *mut c_void,
    ) -> CGEventRef {
        match event_type {
            K_CG_EVENT_KEY_DOWN => unsafe {
                let kc = CGEventGetIntegerValueField(event, K_CG_KEYBOARD_EVENT_KEYCODE);
                if let Some((c, lbl, right, num)) = map_mac_keycode(kc) {
                    emit_key(c, lbl, right, num);
                } else {
                    emit_key("KeyA", "•", false, false);
                }
            },
            K_CG_EVENT_LEFT_MOUSE_DOWN => emit_mouse(false),
            K_CG_EVENT_RIGHT_MOUSE_DOWN => emit_mouse(true),
            _ => {}
        }
        event
    }

    pub fn run_loop() {
        unsafe {
            let mask: CGEventMask = (1u64 << K_CG_EVENT_KEY_DOWN)
                | (1u64 << K_CG_EVENT_LEFT_MOUSE_DOWN)
                | (1u64 << K_CG_EVENT_RIGHT_MOUSE_DOWN);
            let tap = CGEventTapCreate(
                K_CG_SESSION_EVENT_TAP,
                K_CG_HEAD_INSERT_EVENT_TAP,
                K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
                mask,
                tap_callback,
                null_mut(),
            );
            if tap.is_null() {
                FAILED.store(true, Ordering::Relaxed);
                return;
            }
            let src = CFMachPortCreateRunLoopSource(null_mut(), tap, 0);
            if src.is_null() {
                FAILED.store(true, Ordering::Relaxed);
                return;
            }
            let rl = CFRunLoopGetCurrent();
            CFRunLoopAddSource(rl, src, kCFRunLoopCommonModes);
            CGEventTapEnable(tap, true);
            CFRunLoopRun();
        }
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::{emit_key, emit_mouse, FAILED};
    use rdev::{listen, Button, Event, EventType, Key};
    use std::sync::atomic::Ordering;

    fn map_rdev_key(key: Key) -> Option<(&'static str, &'static str, bool, bool)> {
        let m = match key {
            Key::KeyA => ("KeyA", "A", false, false),
            Key::KeyB => ("KeyB", "B", false, false),
            Key::KeyC => ("KeyC", "C", false, false),
            Key::KeyD => ("KeyD", "D", false, false),
            Key::KeyE => ("KeyE", "E", false, false),
            Key::KeyF => ("KeyF", "F", false, false),
            Key::KeyG => ("KeyG", "G", false, false),
            Key::KeyH => ("KeyH", "H", true, false),
            Key::KeyI => ("KeyI", "I", true, false),
            Key::KeyJ => ("KeyJ", "J", true, false),
            Key::KeyK => ("KeyK", "K", true, false),
            Key::KeyL => ("KeyL", "L", true, false),
            Key::KeyM => ("KeyM", "M", true, false),
            Key::KeyN => ("KeyN", "N", true, false),
            Key::KeyO => ("KeyO", "O", true, false),
            Key::KeyP => ("KeyP", "P", true, false),
            Key::KeyQ => ("KeyQ", "Q", false, false),
            Key::KeyR => ("KeyR", "R", false, false),
            Key::KeyS => ("KeyS", "S", false, false),
            Key::KeyT => ("KeyT", "T", false, false),
            Key::KeyU => ("KeyU", "U", true, false),
            Key::KeyV => ("KeyV", "V", false, false),
            Key::KeyW => ("KeyW", "W", false, false),
            Key::KeyX => ("KeyX", "X", false, false),
            Key::KeyY => ("KeyY", "Y", true, false),
            Key::KeyZ => ("KeyZ", "Z", false, false),
            Key::Num0 => ("Digit0", "0", true, true),
            Key::Num1 => ("Digit1", "1", false, true),
            Key::Num2 => ("Digit2", "2", false, true),
            Key::Num3 => ("Digit3", "3", false, true),
            Key::Num4 => ("Digit4", "4", false, true),
            Key::Num5 => ("Digit5", "5", false, true),
            Key::Num6 => ("Digit6", "6", true, true),
            Key::Num7 => ("Digit7", "7", true, true),
            Key::Num8 => ("Digit8", "8", true, true),
            Key::Num9 => ("Digit9", "9", true, true),
            Key::Space => ("Space", "Space", false, false),
            Key::Return => ("Enter", "⏎", true, false),
            Key::Backspace => ("Backspace", "⌫", true, false),
            Key::Tab => ("Tab", "Tab", false, false),
            Key::Escape => ("Escape", "Esc", false, false),
            Key::CapsLock => ("CapsLock", "Caps", false, false),
            Key::ShiftLeft => ("ShiftLeft", "Shift", false, false),
            Key::ShiftRight => ("ShiftRight", "Shift", true, false),
            Key::ControlLeft => ("ControlLeft", "Ctrl", false, false),
            Key::ControlRight => ("ControlRight", "Ctrl", true, false),
            Key::Alt => ("AltLeft", "Alt", false, false),
            Key::AltGr => ("AltRight", "Alt", true, false),
            Key::Minus => ("Minus", "-", true, false),
            Key::Equal => ("Equal", "=", true, false),
            Key::BackQuote => ("Backquote", "`", false, false),
            Key::LeftBracket => ("BracketLeft", "[", true, false),
            Key::RightBracket => ("BracketRight", "]", true, false),
            Key::BackSlash => ("Backslash", "\\", true, false),
            Key::SemiColon => ("Semicolon", ";", true, false),
            Key::Quote => ("Quote", "'", true, false),
            Key::Comma => ("Comma", ",", true, false),
            Key::Dot => ("Period", ".", true, false),
            Key::Slash => ("Slash", "/", true, false),
            Key::Delete => ("Delete", "Del", true, false),
            Key::UpArrow => ("ArrowUp", "↑", true, false),
            Key::DownArrow => ("ArrowDown", "↓", true, false),
            Key::LeftArrow => ("ArrowLeft", "←", false, false),
            Key::RightArrow => ("ArrowRight", "→", true, false),
            _ => return None,
        };
        Some(m)
    }

    pub fn run_loop() {
        let res = listen(|event: Event| match event.event_type {
            EventType::KeyPress(key) => {
                if let Some((c, lbl, right, num)) = map_rdev_key(key) {
                    emit_key(c, lbl, right, num);
                } else {
                    emit_key("KeyA", "•", false, false);
                }
            }
            EventType::ButtonPress(Button::Left) => emit_mouse(false),
            EventType::ButtonPress(Button::Right) => emit_mouse(true),
            _ => {}
        });
        if res.is_err() {
            FAILED.store(true, Ordering::Relaxed);
        }
    }
}
