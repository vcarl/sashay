// Counts visits and interactions on this site. Cookieless: no cookies, storage or identifiers
// (AGENTS.md, "Site metrics"). Every payload is built here from fixed labels, never from page text.

type Event = [name: string, props: Record<string, unknown>];

export function pageview(href: string, referrer: string): Event {
  const { origin, pathname, searchParams } = new URL(href);
  const utm = [...searchParams].filter(([k]) => /^utm_(source|medium|campaign)$/.test(k));
  return [
    "$pageview",
    {
      $current_url: `${origin}${pathname}${utm.length ? `?${new URLSearchParams(utm)}` : ""}`,
      $referring_domain: referrer ? new URL(referrer).host : "$direct",
      ...Object.fromEntries(utm),
    },
  ];
}

/** An outbound link's host, and the label of a link that has one; nothing else. */
export function linkClick(href: string, here: string, cta?: string): Event | undefined {
  const { host, protocol } = new URL(href);
  const props = { host: /^http/.test(protocol) && host !== here ? host : undefined, cta };
  if (props.host || cta) return ["sashay_link_clicked", props];
}

const DEMOS = ["#hero", "#cell-fling", "#cell-bar", "#cell-spine", "#cell-code", "#themed", ".plants", ".house"];
/** A demo's fixed label. The Guide's demos are told apart from the same ones elsewhere. */
export function demoName(matches: (selector: string) => boolean, pathname: string) {
  const name = (DEMOS.find(matches) ?? "#example").slice(1).replace("-", "_");
  return /\/guide(\/|$)/.test(pathname) ? `guide_${name}` : name;
}

const FRAME = "[data-sashay-frame]";
const EDGE = "[data-sashay-edge]";

export function startMetrics(key: string, api: string) {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return;
  if (nav.webdriver || /bot|crawl|spider|headless/i.test(nav.userAgent)) return;

  const send = ([event, props]: Event) => {
    // The envelope posthog-js sends with cookieless_mode "always". PostHog's server hashes the IP
    // it sees with $host and $raw_user_agent into a daily id, then drops the IP and user agent.
    const body = {
      api_key: key,
      event,
      distinct_id: "$posthog_cookieless",
      properties: {
        $cookieless_mode: true,
        $device_id: null,
        $process_person_profile: false,
        $host: location.host,
        $pathname: location.pathname,
        $raw_user_agent: nav.userAgent,
        $timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...props,
        site: "sashay", // last: the PostHog project is shared with other sites
      },
    };
    // fetch rather than sendBeacon, which always sends the endpoint's cookies.
    fetch(`${api}/i/v0/e/`, {
      method: "POST",
      body: JSON.stringify(body),
      keepalive: true,
      mode: "no-cors",
      credentials: "omit",
    }).catch(() => {});
  };

  // Whether a demo was used, not how or how often: once per demo and page load.
  const seen = new Set<string>();
  const used = (el: Element | null) => {
    const demo = el && demoName((s) => el.matches(s), location.pathname);
    if (!demo || seen.has(demo)) return;
    seen.add(demo);
    send(["sashay_demo_used", { demo }]);
  };

  // Real input only, in the capture phase, before a handler can take the target away.
  const on = <K extends keyof DocumentEventMap>(type: K, fn: (e: DocumentEventMap[K], target: Element) => void) =>
    document.addEventListener(
      type,
      (e) => {
        try {
          if (e.isTrusted && e.target instanceof Element) fn(e, e.target);
        } catch {
          // Metrics never break the page.
        }
      },
      { capture: true, passive: true },
    );

  const onLink = (target: Element) => {
    const a = target.closest<HTMLAnchorElement>("a[href]");
    const event = a && linkClick(a.href, location.host, a.dataset.cta);
    if (event) send(event);
  };
  on("click", (_, target) => {
    onLink(target);
    const block = target.closest(".expressive-code");
    if (block && target.closest(".copy button"))
      send(["sashay_code_copied", { block: [...document.querySelectorAll(".expressive-code")].indexOf(block) + 1 }]);
    // The hero's and the spine cell's buttons, and a theme picker, sit outside their frames.
    if (target.closest(".th-pick")) used(document.querySelector("#hero, #themed"));
    else if (target.closest("[data-act]"))
      used(document.querySelector(target.closest("#readout") ? "#hero" : "#cell-spine"));
    else if (target.closest(`${EDGE}, button, [role=button], input`)) used(target.closest(FRAME));
  });
  on("auxclick", (e, target) => e.button === 1 && onLink(target));
  on("input", (_, target) => target.matches(".bigcode") && used(document.querySelector("#cell-code")));
  on("keydown", (e, target) => {
    if (target.matches(EDGE) && /^(Arrow|Home|End|Enter| )/.test(e.key)) used(target.closest(FRAME));
  });
  on("pointerup", () => used(document.querySelector(`${FRAME}[data-dragging]`)));

  const begin = () => send(pageview(location.href, document.referrer));
  // A prerendered page is not a visit until it is shown.
  const doc = document as Document & { prerendering?: boolean };
  if (doc.prerendering) document.addEventListener("prerenderingchange", begin, { once: true });
  else begin();
}
