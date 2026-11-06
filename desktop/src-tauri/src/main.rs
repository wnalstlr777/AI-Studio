#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod input;
use input::{HitMap, snapshot as input_snapshot};
use std::{sync::{Arc, Mutex, atomic::{AtomicBool, AtomicUsize, Ordering}}, time::Duration};
use tauri::{Emitter, Manager, State, PhysicalPosition};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri_plugin_autostart::ManagerExt;

#[derive(Default)]
struct Runtime {
    hit: Mutex<HitMap>, target: Mutex<Option<String>>, dragging: AtomicBool,
    ignored: AtomicBool, office_clicks: AtomicUsize, last_url: Mutex<Option<String>>,
}
fn qa_mode() -> bool { std::env::var("HINA_NATIVE_QA").as_deref()==Ok("1") }
fn launch_target(url: String, state: &Runtime) -> Result<(), String> {
    if qa_mode() { *state.last_url.lock().unwrap()=Some(url); return Ok(()); }
    open::that_detached(url).map_err(|e| e.to_string())
}
#[tauri::command]
fn open_office(state: State<Runtime>) -> Result<(), String> {
    if qa_mode() { state.office_clicks.fetch_add(1,Ordering::SeqCst); }
    launch_target("https://wnalstlr777.github.io/AI-Studio/".into(), &state)
}
#[tauri::command]
fn qa_probe(window: tauri::WebviewWindow, state: State<Runtime>) -> Result<serde_json::Value,String> {
    if !qa_mode() { return Err("Native QA mode is disabled".into()); }
    let p=window.outer_position().map_err(|e|e.to_string())?;
    let size=window.inner_size().map_err(|e|e.to_string())?;
    let last_url=state.last_url.lock().unwrap().clone();
    Ok(serde_json::json!({"x":p.x,"y":p.y,"width":size.width,"height":size.height,
        "ignored":state.ignored.load(Ordering::SeqCst),"dragging":state.dragging.load(Ordering::SeqCst),
        "clicks":state.office_clicks.load(Ordering::SeqCst),"last_url":last_url}))
}
#[tauri::command]
fn hit_map(state: State<Runtime>, pixels: Vec<u8>, width: usize, height: usize) -> Result<(), String> {
    if width == 0 || height == 0 || width > 512 || height > 512 || pixels.len() != width*height { return Err("Invalid hit map".into()); }
    let mut hit = state.hit.lock().map_err(|e| e.to_string())?;
    hit.pixels = Arc::new(pixels); hit.width = width; hit.height = height; Ok(())
}
#[tauri::command]
async fn drag_pet(window: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<(),String> {
    let state=app.state::<Runtime>();
    state.dragging.store(true,Ordering::SeqCst);
    let result=(||{
        window.set_ignore_cursor_events(false).map_err(|e|e.to_string())?;
        state.ignored.store(false,Ordering::SeqCst);
        window.start_dragging().map_err(|e|e.to_string())
    })();
    state.dragging.store(false,Ordering::SeqCst);
    result
}
#[tauri::command]
fn autostart(app: tauri::AppHandle, enabled: Option<bool>) -> Result<bool, String> {
    let manager = app.autolaunch();
    if let Some(on) = enabled { if on { manager.enable() } else { manager.disable() }.map_err(|e| e.to_string())?; }
    manager.is_enabled().map_err(|e| e.to_string())
}
fn valid_url(url: &str) -> bool {
    url.strip_prefix("https://github.com/wnalstlr777/AI-Studio/actions/runs/")
        .map(|tail| {
            let parts: Vec<_> = tail.split('/').collect();
            let digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
            (parts.len() == 1 && digits(parts[0])) ||
            (parts.len() == 3 && digits(parts[0]) && parts[1] == "attempts" && digits(parts[2]))
        }).unwrap_or(false)
}
#[tauri::command]
fn open_run(url: String, state: State<Runtime>) -> Result<(), String> {
    if !valid_url(&url) { return Err("Invalid Actions URL".into()); }
    launch_target(url, &state)
}
#[tauri::command]
async fn notify(app: tauri::AppHandle, state: State<'_, Runtime>, url: String, failure: bool) -> Result<(), String> {
    if !valid_url(&url) { return Err("Invalid Actions URL".into()); }
    // One app notification at a time; the frontend chooses failure before success.
    if let Some(old) = app.get_webview_window("notice") { old.destroy().map_err(|e| e.to_string())?; }
    *state.target.lock().unwrap() = Some(url);
    let path = if failure { "notice.html?failure=1" } else { "notice.html" };
    let mut notice_builder=tauri::WebviewWindowBuilder::new(&app, "notice", tauri::WebviewUrl::App(path.into()));
    if qa_mode() { notice_builder=notice_builder.additional_browser_args("--remote-debugging-port=9222"); }
    let notice = notice_builder
        .title("MS 사무실 — QA 알림").inner_size(320.,110.).decorations(false).resizable(false)
        .always_on_top(true).skip_taskbar(true).focused(false).build().map_err(|e| e.to_string())?;
    if let Some(pet) = app.get_webview_window("main") {
        let (x,y,w,h) = work_area(&pet)?;
        let size = notice.outer_size().map_err(|e| e.to_string())?;
        notice.set_position(PhysicalPosition::new(x+w-size.width as i32-12,y+h-size.height as i32-12)).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn notice_action(app: tauri::AppHandle, state: State<Runtime>, open: bool) -> Result<(), String> {
    if open { if let Some(url) = state.target.lock().unwrap().clone() { if !valid_url(&url) { return Err("Invalid Actions URL".into()); } launch_target(url, &state)?; } }
    if let Some(w) = app.get_webview_window("notice") { w.close().map_err(|e| e.to_string())?; } Ok(())
}
fn work_area(window: &tauri::WebviewWindow) -> Result<(i32,i32,i32,i32), String> {
    #[cfg(windows)] {
        use windows_sys::Win32::Graphics::Gdi::{MonitorFromWindow, GetMonitorInfoW, MONITORINFO, MONITOR_DEFAULTTONEAREST};
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let mut info: MONITORINFO = unsafe { std::mem::zeroed() };
        info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        unsafe {
            let monitor = MonitorFromWindow(hwnd.0 as _, MONITOR_DEFAULTTONEAREST);
            if GetMonitorInfoW(monitor, &mut info) != 0 {
                let r = info.rcWork; return Ok((r.left,r.top,r.right-r.left,r.bottom-r.top));
            }
        }
    }
    let monitor = window.current_monitor().map_err(|e| e.to_string())?.ok_or("No monitor")?;
    let p = monitor.position(); let s = monitor.size(); Ok((p.x,p.y,s.width as i32,s.height as i32))
}
#[tauri::command]
fn move_pet(window: tauri::WebviewWindow, dx: f64, bottom: bool) -> Result<i32, String> {
    if window.label() != "main" || !dx.is_finite() || dx.abs() > 100. { return Err("Invalid move".into()); }
    let (x,y,w,h) = work_area(&window)?; let size = window.outer_size().map_err(|e| e.to_string())?;
    let p = window.outer_position().map_err(|e| e.to_string())?;
    let max_x = x+(w-size.width as i32).max(0); let max_y = y+(h-size.height as i32).max(0);
    let next_x = (p.x+dx.round() as i32).clamp(x,max_x);
    let next_y = if bottom { max_y } else { p.y.clamp(y,max_y) };
    window.set_position(PhysicalPosition::new(next_x,next_y)).map_err(|e| e.to_string())?;
    Ok(if next_x >= max_x { -1 } else if next_x <= x { 1 } else if dx < 0. { -1 } else { 1 })
}
#[tauri::command]
fn quit(app: tauri::AppHandle) { app.exit(0); }
fn main() {
    let mut context=tauri::generate_context!();
    if qa_mode() {
        for window in &mut context.config_mut().app.windows {
            window.additional_browser_args=Some("--remote-debugging-port=9222".into());
        }
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,_,_| { if let Some(w)=app.get_webview_window("main") { let _=move_pet(w.clone(),0.,true); let _=w.show(); } }))
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .manage(Runtime::default())
        .invoke_handler(tauri::generate_handler![hit_map,drag_pet,autostart,open_run,open_office,qa_probe,notify,notice_action,move_pet,quit])
        .setup(|app| {
            let settings = MenuItem::with_id(app,"settings","설정",true,None::<&str>)?;
            let restore = MenuItem::with_id(app,"restore","화면 하단으로 복귀",true,None::<&str>)?;
            let exit = MenuItem::with_id(app,"quit","종료",true,None::<&str>)?;
            let menu = Menu::with_items(app,&[&settings,&restore,&exit])?;
            // Embedded RGBA tray mark; no external icon dependency.
            let mut rgba=vec![0u8;32*32*4]; for p in rgba.chunks_mut(4) { p.copy_from_slice(&[90,166,185,255]); }
            TrayIconBuilder::new().icon(tauri::image::Image::new_owned(rgba,32,32)).tooltip("MS 사무실 — 히나 비서")
                .menu(&menu).on_menu_event(|app,event| match event.id.as_ref() {
                    "quit"=>app.exit(0),
                    "settings"=>{ if let Some(w)=app.get_webview_window("main") { let _=move_pet(w.clone(),0.,false); let _=w.show(); let _=w.emit("settings",()); } },
                    "restore"=>{ if let Some(w)=app.get_webview_window("main") { let _=move_pet(w,0.,true); } }, _=>{}
                }).build(app)?;
            let handle=app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(Duration::from_millis(80));
                    let Some(w)=handle.get_webview_window("main") else { break };
                    let state=handle.state::<Runtime>();
                    if state.dragging.load(Ordering::SeqCst) { continue; }
                    #[cfg(windows)]
                    unsafe {
                        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState,VK_LBUTTON};
                        if GetAsyncKeyState(VK_LBUTTON as i32)<0 { continue; }
                    }
                    // No guard is alive while any Tauri/window API below synchronously dispatches.
                    let hit=input_snapshot(&state.hit);
                    if let (Ok(cursor),Ok(pos),Ok(size))=(w.cursor_position(),w.outer_position(),w.inner_size()) {
                        let opaque=hit.opaque(cursor.x-pos.x as f64,cursor.y-pos.y as f64,size.width,size.height);
                        let ignore=!opaque;
                        if state.ignored.load(Ordering::SeqCst)!=ignore {
                            if w.set_ignore_cursor_events(ignore).is_ok() { state.ignored.store(ignore,Ordering::SeqCst); }
                        }
                    }
                }
            });
            Ok(())
        }).run(context).expect("히나 비서 실행 실패");
}
