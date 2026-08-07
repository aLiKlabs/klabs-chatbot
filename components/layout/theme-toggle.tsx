"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "klabs-dashboard-theme";

export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const selected = window.localStorage.getItem(STORAGE_KEY) === "light";
    setLight(selected);
    document.documentElement.dataset.dashboardTheme = selected ? "light" : "dark";
  }, []);

  function toggleTheme() {
    const next = !light;
    setLight(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "light" : "dark");
    document.documentElement.dataset.dashboardTheme = next ? "light" : "dark";
  }

  return (
    <button
      className={`theme-toggle${light ? " is-light" : ""}`}
      type="button"
      onClick={toggleTheme}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Switch to dark mode" : "Switch to light mode"}
    >
      <Sun className="theme-icon theme-sun" size={15} />
      <Moon className="theme-icon theme-moon" size={14} />
      <span className="theme-toggle-thumb" />
    </button>
  );
}
