// Скрываем консоль на Windows в релизе
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    rupor_lib::run()
}
