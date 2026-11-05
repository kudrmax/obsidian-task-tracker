# Блок 2 «Корень сборки, учётки, телефон»

Обзор: `2026-11-05-layers-overview.md`. Пакеты ревью: P1 (корень сборки, телефон), P10 (Google во вкладке, лог ввода).

## Цель

`src/application` не знает про Obsidian и инфраструктуру. Корень сборки — отдельный файл рядом с `main.ts`. Наружу из корня выходят интерфейсы контрактов, а не классы инфраструктуры. Телефонный модуль — тонкий адаптер над сервисом из `application`.

## Что сделать

### 1. Корень сборки

`application/services.ts` (импортирует 11 модулей `infrastructure` и `App` из `obsidian`) → `src/compose.ts`. Страж блока 1 разрешает корню импортировать всё.

`Services` сейчас отдаёт `GoogleAuth`, `GoogleCalendarSource`, `GoogleRedirectLogin`, `WorkCalendarExportScript`, `WorkCalendarShortcut`. Вместо них — интерфейсы в контрактах:

```ts
export interface CalendarOption { readonly id: string; readonly title: string; readonly color: string }
export interface GoogleAccount {
  isLoggedIn(): boolean;
  login(): Promise<string>;
  logout(): Promise<void>;
  listCalendars(): Promise<readonly CalendarOption[]>;
  /** Shown calendar ids: empty means every calendar selected in Google. */
  setShown(all: readonly CalendarOption[], id: string, shown: boolean): Promise<void>;
  isShown(id: string): boolean;
}
export interface WorkCalendarSetup {
  /** The script to paste into Scriptable. */
  scriptableLoader(): string;
  /** Asks the phone for fresh work events. */
  export(): void;
}
```

Реализация — в `application/GoogleAccountService.ts` поверх `GoogleAuth` и `GoogleCalendarSource`, которые приходят из корня через порты (`application/ports.ts`), а не импортом. `WorkCalendarSetup` — тонкая обёртка в корне.

### 2. Вкладка настроек и Google

`ui/SettingsTab.ts:203, 207` решает «вошёл ли» по `settings.google.refreshToken`, `:234–250` сам считает, какие календари показаны (пустой список = все). Это уходит в `GoogleAccount.isLoggedIn/isShown/setShown`. `SettingsTabDeps` → `{ google: GoogleAccount; work: WorkCalendarSetup }`. `GoogleCalendarOption` в UI заменяется на `CalendarOption` из контрактов.

### 3. Лог быстрого ввода

`ui/TaskCalendarView.ts:469–482` (`traceEntry`) пишет «Task Calendar entry log.md» прямо через `app.vault.adapter`. Поведение сохраняется (файл пишется так же, когда пишется сейчас), но запись идёт через зависимость `ViewDeps.entryLog: { append(text: string): void }`, реализованную в корне над адаптером.

### 4. Телефон

`phone/PhoneReminders.ts` — сервис второго фронтенда (iOS через JavaScriptCore), но лежит вне `application` и ходит в домен напрямую. Он переезжает в `application/PhoneReminderService.ts` без изменения логики. Сдвиг слота при snooze (`from`, стр. 85–89) — доменная арифметика: `domain/operations.ts` получает `snoozedSlot(slot, now, minutes): Slot`. `phone/main.ts` остаётся адаптером к проводу (`WireReminder`), импортирует только `application`. Сборка телефонного модуля (`phone/build.mjs`) и его выход не меняются: тесты `tests/phone` проходят без правок ожиданий.

## Не меняется

Вход в Google, выход, выбор календарей, экспорт рабочего календаря, установка скрипта Scriptable, лог ввода, напоминания на телефоне, формат `data.json`. `docs/plugin/` не трогается: ничего из настраиваемого руками не меняется.

## Готово, когда

- В `src/application` нет `obsidian` и `../infrastructure`; страж без этих строк.
- `ui/SettingsTab.ts` не читает `settings.google.refreshToken` и `calendarIds`.
- `src/phone` импортирует только `application` и `settings`.
- `npm test`, `npm run build`, `npm run build:demo` зелёные; проверка в Obsidian: вкладка настроек открывается, раздел Google показывает то же.
