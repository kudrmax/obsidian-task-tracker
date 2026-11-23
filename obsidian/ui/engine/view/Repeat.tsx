import type { RepeatChange, RepeatPage, Weekday } from "../port";
import { Icon } from "./Icon";
import { Row } from "./MenuRows";

/** A track of a few choices, the chosen one lit (the design's switch: Schedule / After done, the units). */
function Segments<T extends string>({ name, cls, choices, chosen, words, onPick }: { readonly name: string; readonly cls: string; readonly choices: readonly T[]; readonly chosen: T; readonly words: Readonly<Record<T, string>>; readonly onPick: (value: T) => void }) {
	return (
		<div className={`tc-repeat-seg ${cls}`} role="group" aria-label={name}>
			{choices.map((value) => (
				<button key={value} type="button" className={`tc-btn tc-repeat-seg-btn${value === chosen ? " is-on" : ""}`} aria-pressed={value === chosen} onClick={() => onPick(value)}>
					{words[value]}
				</button>
			))}
		</div>
	);
}

/**
 * The Repeat page (F202–F204; the design's «Повторы», variant А), the menu's and the bar's alike: Schedule / After done,
 * Every N with − and +, the unit, then the weekdays of a weekly schedule or a monthly one's day, and Remove repeat while
 * the task has a rule. It draws the core's draft and sends each tap back (`onChange`); the port says what a tap makes.
 */
export function RepeatPanel({ page, onChange, onRemove }: { readonly page: RepeatPage; readonly onChange: (change: RepeatChange) => void; readonly onRemove: () => void }) {
	const { draft, words, monthDay } = page;
	return (
		<div className="tc-repeat">
			<Segments name="Repeat kind" cls="tc-repeat-kind" choices={draft.kinds} chosen={draft.kind} words={words.kinds} onPick={(to) => onChange({ what: "kind", to })} />
			<div className="tc-repeat-every">
				<span className="tc-repeat-every-label">{words.every}</span>
				<button type="button" className={`tc-btn is-icon is-accent tc-repeat-step${draft.can.fewer ? "" : " is-off"}`} aria-label="Fewer" aria-disabled={!draft.can.fewer} onClick={() => onChange({ what: "every", by: -1 })}>
					<Icon name="minus" />
				</button>
				<span className="tc-repeat-count">{draft.every}</span>
				<button type="button" className="tc-btn is-icon is-accent tc-repeat-step" aria-label="More" onClick={() => onChange({ what: "every", by: 1 })}>
					<Icon name="plus" />
				</button>
			</div>
			<Segments name="Unit" cls="tc-repeat-unit" choices={draft.units} chosen={draft.unit} words={words.units} onPick={(to) => onChange({ what: "unit", to })} />
			{draft.detail === "weekdays" ? (
				<div className="tc-repeat-week">
					{words.weekdays.map(({ short, name }, index) => {
						const day = index as Weekday;
						const on = draft.days.includes(day);
						return (
							<button key={name} type="button" className={`tc-btn tc-repeat-day${on ? " is-on" : ""}`} aria-label={name} aria-pressed={on} onClick={() => onChange({ what: "weekday", day })}>
								{short}
							</button>
						);
					})}
				</div>
			) : draft.detail === "monthDay" ? (
				<div className="tc-repeat-month">{monthDay}</div>
			) : null}
			{draft.removable ? <Row label={words.remove} icon="removeDue" className="tc-repeat-remove" onPick={onRemove} /> : null}
		</div>
	);
}
