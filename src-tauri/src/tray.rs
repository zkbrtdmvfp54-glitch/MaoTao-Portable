use crate::settings::Preferences;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};

pub fn build_tray_menu<R: Runtime>(
    app: &AppHandle<R>,
    prefs: &Preferences,
    listening: bool,
    visible: bool,
    unavailable_reason: &str,
    wayland: bool,
) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;

    let title = MenuItem::with_id(app, "noop:title", "毛桃桌面宠物", false, None::<&str>)?;
    let open_panel = MenuItem::with_id(app, "action:openMenu", "打开控制面板…", true, None::<&str>)?;
    menu.append(&title)?;
    menu.append(&open_panel)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // 花色子菜单
    let coat_sub = Submenu::new(app, "更换花色", true)?;
    for (label, val) in [
        ("液态黑猫", "solidblack"),
        ("灰白虎斑（毛桃）", "maotao"),
        ("三花猫", "calico"),
        ("双色布偶猫", "ragdoll"),
        ("橘猫", "orange"),
        ("黑白奶牛猫", "black"),
        ("暹罗猫", "siamese"),
        ("异瞳白猫", "white"),
    ] {
        let item = CheckMenuItem::with_id(
            app,
            format!("set:coat:{val}"),
            label,
            true,
            prefs.coat == val,
            None::<&str>,
        )?;
        coat_sub.append(&item)?;
    }
    menu.append(&coat_sub)?;

    // 快捷开关
    menu.append(&CheckMenuItem::with_id(
        app,
        "toggle:focusMode",
        "专注模式（25 分钟）",
        true,
        prefs.focus_mode,
        None::<&str>,
    )?)?;
    menu.append(&CheckMenuItem::with_id(
        app,
        "toggle:privacyMode",
        "隐私模式 (Alt+Shift+P)",
        true,
        prefs.privacy_mode,
        None::<&str>,
    )?)?;
    menu.append(&CheckMenuItem::with_id(
        app,
        "toggle:clickThrough",
        "锁定点击穿透 (Alt+Shift+L)",
        true,
        prefs.click_through,
        None::<&str>,
    )?)?;
    menu.append(&CheckMenuItem::with_id(
        app,
        "toggle:keyboard",
        "显示键盘与鼠标",
        true,
        prefs.keyboard,
        None::<&str>,
    )?)?;
    menu.append(&CheckMenuItem::with_id(
        app,
        "toggle:leftMouse",
        "左手鼠标",
        true,
        prefs.left_mouse,
        None::<&str>,
    )?)?;
    menu.append(&CheckMenuItem::with_id(
        app,
        "toggle:numpad",
        "数字键盘 (98%)",
        true,
        prefs.numpad,
        None::<&str>,
    )?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // 互动动作
    let interact_sub = Submenu::new(app, "互动动作", true)?;
    interact_sub.append(&MenuItem::with_id(app, "perform:pet", "摸摸头", true, None::<&str>)?)?;
    interact_sub.append(&MenuItem::with_id(app, "perform:poke", "戳鼻子", true, None::<&str>)?)?;
    interact_sub.append(&PredefinedMenuItem::separator(app)?)?;
    interact_sub.append(&MenuItem::with_id(app, "perform:yarn", "玩毛线球", true, None::<&str>)?)?;
    interact_sub.append(&MenuItem::with_id(app, "perform:butterfly", "捉蝴蝶", true, None::<&str>)?)?;
    interact_sub.append(&MenuItem::with_id(app, "perform:wash", "舔爪洗脸", true, None::<&str>)?)?;
    interact_sub.append(&PredefinedMenuItem::separator(app)?)?;
    interact_sub.append(&MenuItem::with_id(app, "perform:sleep", "睡觉 / 唤醒", true, None::<&str>)?)?;
    menu.append(&interact_sub)?;

    // 外观与窗口
    let win_sub = Submenu::new(app, "外观与窗口", true)?;
    win_sub.append(&MenuItem::with_id(
        app,
        "action:toggle",
        if visible { "隐藏宠物" } else { "显示宠物" },
        true,
        None::<&str>,
    )?)?;
    win_sub.append(&PredefinedMenuItem::separator(app)?)?;

    let eye_sub = Submenu::new(app, "瞳色", true)?;
    for (label, val) in [
        ("默认瞳色", "auto"),
        ("蓝宝石", "blue"),
        ("琥珀金", "amber"),
        ("祖母绿", "emerald"),
        ("紫罗兰", "violet"),
        ("樱花粉", "rose"),
        ("异瞳蓝金", "odd"),
    ] {
        eye_sub.append(&CheckMenuItem::with_id(
            app,
            format!("set:eyeColor:{val}"),
            label,
            true,
            prefs.eye_color == val,
            None::<&str>,
        )?)?;
    }
    win_sub.append(&eye_sub)?;

    let acc_sub = Submenu::new(app, "头部配饰", true)?;
    for (label, val) in [
        ("无配饰", "none"),
        ("迷你小皇冠", "crown"),
        ("经典头戴耳机", "headphones"),
        ("复古细梁耳机", "retro"),
        ("招财铃铛项圈", "bell"),
        ("嘴叼小鱼干", "fish"),
        ("暖冬小红围巾", "scarf"),
        ("迷你巫师尖帽", "wizard"),
        ("伴星发卡", "star"),
        ("酷盖墨镜", "shades"),
        ("画家贝雷帽", "beret"),
        ("小嫩芽", "sprout"),
        ("天使光环+翅膀", "halo"),
        ("眩晕星星", "dizzy"),
    ] {
        acc_sub.append(&CheckMenuItem::with_id(
            app,
            format!("set:accessory:{val}"),
            label,
            true,
            prefs.accessory == val,
            None::<&str>,
        )?)?;
    }
    win_sub.append(&acc_sub)?;
    win_sub.append(&PredefinedMenuItem::separator(app)?)?;

    let size_sub = Submenu::new(app, "大小", true)?;
    for (label, val) in [("小", "small"), ("中", "medium"), ("大", "large")] {
        size_sub.append(&CheckMenuItem::with_id(
            app,
            format!("set:size:{val}"),
            label,
            true,
            prefs.size == val,
            None::<&str>,
        )?)?;
    }
    win_sub.append(&size_sub)?;

    let pos_sub = Submenu::new(app, "位置", true)?;
    pos_sub.append(&MenuItem::with_id(app, "dock:left", "停靠左下", true, None::<&str>)?)?;
    pos_sub.append(&MenuItem::with_id(app, "dock:right", "停靠右下", true, None::<&str>)?)?;
    pos_sub.append(&MenuItem::with_id(app, "action:center", "居中", true, None::<&str>)?)?;
    pos_sub.append(&MenuItem::with_id(app, "action:reset", "复位到主屏", true, None::<&str>)?)?;
    win_sub.append(&pos_sub)?;
    win_sub.append(&PredefinedMenuItem::separator(app)?)?;

    win_sub.append(&CheckMenuItem::with_id(
        app,
        "toggle:top",
        if wayland { "常驻置顶（Wayland 不支持）" } else { "常驻置顶" },
        !wayland,
        prefs.top,
        None::<&str>,
    )?)?;
    win_sub.append(&CheckMenuItem::with_id(
        app,
        "toggle:hideOnClose",
        "关闭时隐藏至托盘",
        true,
        prefs.hide_on_close,
        None::<&str>,
    )?)?;
    menu.append(&win_sub)?;

    // 声音与反馈
    let sound_sub = Submenu::new(app, "声音与反馈", true)?;
    sound_sub.append(&CheckMenuItem::with_id(app, "toggle:sound", "音效", true, prefs.sound, None::<&str>)?)?;
    sound_sub.append(&CheckMenuItem::with_id(app, "toggle:keySound", "键盘音效", true, prefs.key_sound, None::<&str>)?)?;
    let vol_sub = Submenu::new(app, "音量", true)?;
    for (label, val) in [("0%", "0"), ("25%", "0.25"), ("50%", "0.5"), ("70%", "0.7"), ("100%", "1")] {
        let num: f64 = val.parse().unwrap_or(0.7);
        vol_sub.append(&CheckMenuItem::with_id(
            app,
            format!("setnum:volume:{val}"),
            label,
            true,
            (prefs.volume - num).abs() < 0.03,
            None::<&str>,
        )?)?;
    }
    sound_sub.append(&vol_sub)?;
    let theme_sub = Submenu::new(app, "反馈主题", true)?;
    for (label, val) in [("暖米", "cream"), ("薄荷", "mint"), ("星夜", "night"), ("青绿", "green")] {
        theme_sub.append(&CheckMenuItem::with_id(
            app,
            format!("set:theme:{val}"),
            label,
            true,
            prefs.theme == val,
            None::<&str>,
        )?)?;
    }
    sound_sub.append(&theme_sub)?;
    menu.append(&sound_sub)?;

    // 键盘与输入
    let input_sub = Submenu::new(app, "键盘与输入", true)?;
    let link_label = format!(
        "跨应用输入联动{}",
        if prefs.standby_mode {
            "（待机中）"
        } else if unavailable_reason.contains("Wayland") {
            "（Wayland 暂不可用）"
        } else if !unavailable_reason.is_empty() {
            "（暂不可用）"
        } else if listening {
            "（监听中）"
        } else {
            "（已暂停）"
        }
    );
    input_sub.append(&CheckMenuItem::with_id(
        app,
        "action:toggleInput",
        link_label,
        unavailable_reason.is_empty() && !prefs.standby_mode,
        listening,
        None::<&str>,
    )?)?;
    input_sub.append(&PredefinedMenuItem::separator(app)?)?;
    let kb_sub = Submenu::new(app, "键盘样式", true)?;
    for (label, val) in [
        ("经典奶白", "cream"),
        ("抹茶青白", "matcha"),
        ("樱花粉白", "sakura"),
        ("曜石暗夜", "obsidian"),
    ] {
        kb_sub.append(&CheckMenuItem::with_id(
            app,
            format!("set:keyboardStyle:{val}"),
            label,
            true,
            prefs.keyboard_style == val,
            None::<&str>,
        )?)?;
    }
    input_sub.append(&kb_sub)?;
    let view_sub = Submenu::new(app, "键盘视角", true)?;
    for (label, val) in [("猫咪视角", "cat"), ("镜像左右", "mirror")] {
        view_sub.append(&CheckMenuItem::with_id(
            app,
            format!("set:view:{val}"),
            label,
            true,
            prefs.view == val,
            None::<&str>,
        )?)?;
    }
    input_sub.append(&view_sub)?;
    let sleep_sub = Submenu::new(app, "自动休眠", true)?;
    for mins in [2u32, 5, 10] {
        sleep_sub.append(&CheckMenuItem::with_id(
            app,
            format!("setu32:sleepMinutes:{mins}"),
            format!("{mins} 分钟"),
            true,
            prefs.sleep_minutes == mins,
            None::<&str>,
        )?)?;
    }
    input_sub.append(&sleep_sub)?;
    input_sub.append(&PredefinedMenuItem::separator(app)?)?;
    input_sub.append(&MenuItem::with_id(app, "action:typing", "中英文试打…", true, None::<&str>)?)?;
    menu.append(&input_sub)?;

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "action:quit", "退出程序", true, None::<&str>)?)?;

    Ok(menu)
}
