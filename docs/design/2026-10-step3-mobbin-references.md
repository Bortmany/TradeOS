# Step 3 screen references (Mobbin, pulled 30 Sep 2026)

Real-app patterns for the pre-trade checklist, position-size calculator and "why I entered" + screenshots. For the Step 3 ui-designer. These are patterns to borrow, not to copy.

## Position-size calculator
- [Binance — futures calculator](https://mobbin.com/screens/9911b43d-9bf4-43f6-94f2-56bad87de3e2): Long/Short toggle, labelled inputs with the unit inside the field on the right (USDT/BTC), a "Results" block with rows showing "--" until calculated, one full-width Calculate button. **Borrow:** unit-in-field and the results rows. **Skip:** the Calculate button — our result should update live as you type.
- [Realtor.com — proceeds calculator](https://mobbin.com/screens/cef381df-54b2-431c-9d65-6390a3ca579d): big answer card on top ("Estimated proceeds $191,856"), the working listed underneath line by line (+/−), inputs below with % and $ side by side. **Borrow:** this is the closest match to "show the working" — answer card (contracts / lots) on top, then risk $ → $ per contract → raw count → rounded down → real risk %.
- [Revolut — buy amount](https://mobbin.com/screens/ee3a7d47-eae3-4c77-9c5e-df1ae308cf67): one big number plus a red inline warning line ("minimum order value…"). **Borrow:** the plain red line for "unknown symbol" / "stop is zero".

## Pre-trade checklist
- [Liven — to-do](https://mobbin.com/screens/830acd26-9c41-4a51-a754-0ce158b73563): "3 of 4 completed" counter, large round tick targets on the right (thumb-friendly), ticked items struck through.
- [ClickUp — checklists](https://mobbin.com/screens/fdf99039-e57d-452b-9b4e-c79e162cd8cc): "Checklist 1/2" header, chips to switch between checklists, "+ Add item" inline. **Borrow:** chips for picking a template, inline add.
- [Deel — onboarding card](https://mobbin.com/screens/63e34f8f-acb6-4620-bfd6-dbb38ef1508d): a dashboard card with a % bar and the next step. **Borrow:** the dashboard checklist card.
- [Target — checklist progress](https://mobbin.com/screens/5c2bd4eb-0deb-413f-976c-133844fe32e1): thin progress bar under the title.

## "Why I entered" + screenshots
- [stoic. — daily summary](https://mobbin.com/screens/a7a094e6-9dc2-4ae6-a96c-37be09f3fa46): prompt as a heading, a row of square picture slots with "+" above the text field. **Borrow:** a thumbnail row above the text box (max 5 slots).
- [Me+ — entry](https://mobbin.com/screens/356b5918-f4d9-4abc-8469-edb9d442adca): one small add-picture tile under the text, above the keyboard — works one-handed.
- [Journal (Apple) — entry](https://mobbin.com/screens/792366ac-8131-4d8f-96af-f2c1fcdba3f5): attachments as cards with an "×" to remove. **Borrow:** the "×" delete on each thumbnail.
