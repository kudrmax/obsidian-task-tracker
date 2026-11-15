/**
 * A synthetic tasks file of about 30 KB, shaped like a real one: a project tree, an inbox, today's list with sections,
 * slots, reminders and subtasks, a long Soon, a Backlog and a long Done. Made up from counters, never from a real file.
 */
export function bigTasksFile(today: string): string {
	const projects = ["Home", "Work", "Health", "Trips", "Reading", "Money", "Friends", "Garden"];
	const lines: string[] = ["## Inbox", ""];
	for (let i = 0; i < 25; i++) lines.push(`- [ ] Inbox idea number ${i} about something to sort later${i % 4 === 0 ? ` 🗂️ ${projects[i % projects.length]}` : ""}`);
	lines.push("", "## Projects", "");
	for (const [i, p] of projects.entries()) {
		lines.push(`- ${p}${i === 0 ? " [[Notes/Home]]" : ""}`);
		lines.push(`\t- ${p} part one`, `\t- ${p} part two`);
		if (i % 3 === 0) lines.push(`\t\t- ${p} deep part`);
	}
	lines.push("", "## Now", "");
	for (let i = 0; i < 12; i++) {
		const hour = String(8 + i).padStart(2, "0");
		lines.push(`- [${i % 5 === 0 ? "/" : " "}] p${(i % 3) + 1} Today's task ${i} with a longer title to read ⏰ ${today} ${hour}:00-${hour}:30${i % 4 === 0 ? " 🔔" : ""} 🗂️ ${projects[i % projects.length]}`);
		if (i % 3 === 0) lines.push(`\t- [ ] Step one of task ${i}`, `\t- [x] Step two of task ${i}`, "\t\tA note under the step");
	}
	for (let i = 0; i < 10; i++) lines.push(`- [ ] Unslotted today ${i} #label/Fast 📅 ${today}`);
	lines.push("### Errands");
	for (let i = 0; i < 8; i++) lines.push(`- [ ] Errand ${i} to run on the way home`);
	lines.push("### Calls");
	for (let i = 0; i < 6; i++) lines.push(`- [ ] Call person ${i} about the plan 🗂️ Friends`);
	lines.push("", "## Soon", "");
	for (let i = 0; i < 60; i++) {
		const day = Number(today.slice(8)) + 1 + (i % 9);
		const date = `${today.slice(0, 8)}${String(Math.min(day, 28)).padStart(2, "0")}`;
		lines.push(`- [ ] Soon task ${i} waiting for its day${i % 2 === 0 ? ` 📅 ${date}` : ""}${i % 7 === 0 ? " 🔁 every week" : ""}${i % 5 === 0 ? ` 🗂️ ${projects[i % projects.length]}` : ""}`);
		if (i % 10 === 0) lines.push(`\t- [ ] Subtask of soon ${i}`);
	}
	lines.push("### Home");
	for (let i = 0; i < 10; i++) lines.push(`- [ ] Home chore ${i} 🗂️ Home`);
	lines.push("", "## Backlog", "");
	for (let i = 0; i < 110; i++) lines.push(`- [ ] Backlog item ${i} that may happen one day${i % 6 === 0 ? ` 🗂️ ${projects[i % projects.length]}` : ""}`);
	lines.push("", "## Done", "");
	for (let i = 0; i < 340; i++) lines.push(`- [x] Done long ago ${i} with its result written down`);
	lines.push("");
	return lines.join("\n");
}
