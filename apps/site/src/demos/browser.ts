import { mount as finance } from "./finance";
import { mount as house } from "./house";
import "./browser.css";

const apps = { finance: [finance, "portfolio.example"], house: [house, "house.example"] } as const;

// A pretend browser around a demo app: window chrome, an address bar the app writes to through
// `onUrl` (never the real location), and the app itself at 80%, so a full-size app fits.
export function browse(el: HTMLElement, options: object = {}) {
  const [mount, host] = apps[el.dataset.demoApp as keyof typeof apps];
  el.classList.add("mb");
  el.innerHTML = `<div class="mb-bar"><span class="mb-chrome" aria-hidden="true"><i></i><i></i><i></i><b>‹</b><b>›</b></span><output class="mb-url" aria-label="Address"></output></div><div class="mb-view"></div>`;
  const url = el.querySelector("output") as HTMLOutputElement;
  const view = el.lastElementChild as HTMLElement;
  // sashay measures drags in viewport px (clientX) against widths in the app's own px
  // (clientWidth), so under zoom an edge trails the pointer by 20%. Rescale clientX on the way in.
  // ponytail: drop this once sashay measures the frame with getBoundingClientRect.
  const zoom = Number(getComputedStyle(view).zoom) || 1;
  for (const type of ["pointerdown", "pointermove", "pointerup"])
    view.addEventListener(
      type,
      (e) => Object.defineProperty(e, "clientX", { value: (e as PointerEvent).clientX / zoom }),
      true,
    );
  return mount(view, { ...options, onUrl: (u: string) => (url.value = `${host}/${u}`) });
}
