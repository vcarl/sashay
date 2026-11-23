import { type ReactNode, useState } from "react";
import { House, type HouseProps } from "./house";
import { Plants, type PlantsProps } from "./plants";
import "./browser.css";

// A pretend browser around a demo app: window chrome, an address bar the app writes to through
// `onUrl` (never the real location), and the app itself at 80%, so a full-size app fits.
function Browser({ host, children }: { host: string; children: (onUrl: (url: string) => void) => ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  return (
    <div className="mb">
      <div className="mb-bar">
        <span className="mb-chrome" aria-hidden="true">
          <i />
          <i />
          <i />
          <b>‹</b>
          <b>›</b>
        </span>
        <output className="mb-url" aria-label="Address">
          {url !== null && `${host}/${url}`}
        </output>
      </div>
      <div className="mb-view">{children(setUrl)}</div>
    </div>
  );
}

// The islands the site mounts: each app in its browser.
export const PlantsDemo = (props: Omit<PlantsProps, "onUrl">) => (
  <Browser host="plants.example">{(onUrl) => <Plants {...props} onUrl={onUrl} />}</Browser>
);
export const HouseDemo = (props: Omit<HouseProps, "onUrl">) => (
  <Browser host="house.example">{(onUrl) => <House {...props} onUrl={onUrl} />}</Browser>
);
