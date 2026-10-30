import { completeScript, ScriptableNotificationCenter, ScriptableVaultFiles, showInApp } from "./Scriptable";
import { TaskNotifications, type TaskNotificationSettings } from "./TaskNotifications";

/** Written at the top of the built script by `scriptable/build.mjs`, for the user to edit. */
declare const SETTINGS: TaskNotificationSettings;

const count = await new TaskNotifications(SETTINGS, new ScriptableVaultFiles(), new ScriptableNotificationCenter()).run(new Date());
await showInApp("Уведомления поставлены", `Задач на время впереди: ${count}`);
completeScript();
