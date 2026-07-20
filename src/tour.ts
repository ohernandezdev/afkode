// First-run onboarding tour: a spotlight overlay that walks through a
// fixed list of real UI elements. Kept framework-free and DOM-driven to
// match the rest of the app.

export interface TourStep {
  selector: string;
  title: string;
  body: string;
  onEnter?: () => void;
  onLeave?: () => void;
}

export interface TourLabels {
  skip: string;
  next: string;
  done: string;
  stepOf: (i: number, n: number) => string;
}

let active = false;

export function isTourActive(): boolean {
  return active;
}

export function startTour(
  steps: TourStep[],
  labels: TourLabels,
  onEnd: (skipped: boolean) => void,
): void {
  if (active || !steps.length) return;
  active = true;

  const overlay = document.createElement("div");
  overlay.className = "tour-overlay";
  overlay.innerHTML = `
    <div class="tour-spot"></div>
    <div class="tour-tip">
      <div class="tour-tip-step"></div>
      <h3 class="tour-tip-title"></h3>
      <p class="tour-tip-body"></p>
      <div class="tour-tip-actions">
        <button type="button" class="ask-btn tour-skip"></button>
        <button type="button" class="ask-btn ok tour-next"></button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const spot = overlay.querySelector<HTMLElement>(".tour-spot")!;
  const tip = overlay.querySelector<HTMLElement>(".tour-tip")!;
  const stepEl = overlay.querySelector<HTMLElement>(".tour-tip-step")!;
  const titleEl = overlay.querySelector<HTMLElement>(".tour-tip-title")!;
  const bodyEl = overlay.querySelector<HTMLElement>(".tour-tip-body")!;
  const skipBtn = overlay.querySelector<HTMLButtonElement>(".tour-skip")!;
  const nextBtn = overlay.querySelector<HTMLButtonElement>(".tour-next")!;

  skipBtn.textContent = labels.skip;

  let index = 0;

  function place() {
    const step = steps[index];
    const target = document.querySelector<HTMLElement>(step.selector);
    if (!target) {
      advance();
      return;
    }
    const r = target.getBoundingClientRect();
    const pad = 6;
    spot.style.left = `${r.left - pad}px`;
    spot.style.top = `${r.top - pad}px`;
    spot.style.width = `${r.width + pad * 2}px`;
    spot.style.height = `${r.height + pad * 2}px`;

    stepEl.textContent = labels.stepOf(index + 1, steps.length);
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    nextBtn.textContent = index === steps.length - 1 ? labels.done : labels.next;

    // Position the tip below the target, flipping above if it wouldn't
    // fit, and clamping horizontally so it never spills off-screen.
    const tipRect = tip.getBoundingClientRect();
    const margin = 12;
    let top = r.bottom + margin;
    if (top + tipRect.height > window.innerHeight) {
      top = Math.max(margin, r.top - tipRect.height - margin);
    }
    let left = r.left;
    left = Math.min(left, window.innerWidth - tipRect.width - margin);
    left = Math.max(margin, left);
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  }

  function enterStep() {
    steps[index].onEnter?.();
    // Let onEnter's DOM changes (e.g. opening a panel) settle before
    // measuring positions off it.
    requestAnimationFrame(place);
  }

  function leaveStep() {
    steps[index].onLeave?.();
  }

  function advance() {
    leaveStep();
    index++;
    if (index >= steps.length) {
      finish(false);
      return;
    }
    enterStep();
  }

  function finish(skipped: boolean) {
    if (!active) return;
    if (index < steps.length) leaveStep();
    active = false;
    window.removeEventListener("resize", place);
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
    onEnd(skipped);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") finish(true);
  }

  nextBtn.addEventListener("click", advance);
  skipBtn.addEventListener("click", () => finish(true));
  window.addEventListener("resize", place);
  document.addEventListener("keydown", onKeydown);

  enterStep();
}
