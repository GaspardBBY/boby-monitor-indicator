/*
 * Linuxtricks Monitor Indicator
 * Author: Adrien Linuxtricks (forked from Michael Knap)
 * License: MIT License
 */
"use strict";

import GLib from "gi://GLib";
import Gio from "gi://Gio";
import St from "gi://St";
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const UPDATE_INTERVAL_SECONDS = 5;

const SystemMonitorIndicator = GObject.registerClass(
  class SystemMonitorIndicator extends PanelMenu.Button {
    _init(settings) {
      super._init(0.0, "System Monitor Indicator", false);
      if (!settings) {
        log("Boby Monitor: Error - Settings not provided");
        return;
      }

      this._settings = settings;
      this._box = new St.BoxLayout();
      const labelStyle = "margin-right: 12px; font-family: monospace;";

      // --- STATUS BAR LABELS ---
      this._cpuLabel = new St.Label({
        text: "CPU: --%",
        y_align: Clutter.ActorAlign.CENTER,
        style: labelStyle,
      });
      this._box.add_child(this._cpuLabel);

      this._memLabel = new St.Label({
        text: "Mem: --%",
        y_align: Clutter.ActorAlign.CENTER,
        style: labelStyle,
      });
      this._box.add_child(this._memLabel);

      this._swapLabel = new St.Label({
        text: "SWP: --%",
        y_align: Clutter.ActorAlign.CENTER,
        style: labelStyle,
      });
      this._box.add_child(this._swapLabel);

      this._loadLabel = new St.Label({
        text: "L: --%",
        y_align: Clutter.ActorAlign.CENTER,
        style: labelStyle,
      });
      this._box.add_child(this._loadLabel);

      this._powerLabel = new St.Label({
        text: "--W",
        y_align: Clutter.ActorAlign.CENTER,
        style: labelStyle,
      });
      this._box.add_child(this._powerLabel);

      this._batteryLabel = new St.Label({
        text: "🔋--%",
        y_align: Clutter.ActorAlign.CENTER,
        style: "font-family: monospace;",
      });
      this._box.add_child(this._batteryLabel);

      this.add_child(this._box);

      // --- MENU SECTION ---
      this._healthItem = new PopupMenu.PopupMenuItem("Health: --", {
        reactive: false,
      });
      this.menu.addMenuItem(this._healthItem);
      this._cyclesItem = new PopupMenu.PopupMenuItem("Cycles: --", {
        reactive: false,
      });
      this.menu.addMenuItem(this._cyclesItem);
      this._thresholdItem = new PopupMenu.PopupMenuItem("Thresholds: --", {
        reactive: false,
      });
      this.menu.addMenuItem(this._thresholdItem);

      // --- INIT STATE ---
      this._prevUsed = 0;
      this._prevTotal = 0;
      this._timeoutId = 0;
      this._cpuCount = this._getCpuCount();

      this._scheduleUpdate(true);
      this._connectSettings();
      this._updateVisibility();
    }

    _getCpuCount() {
      try {
        const [success, content] = GLib.file_get_contents("/proc/stat");
        if (!success) return 1;
        const lines = new TextDecoder().decode(content).split("\n");
        return lines.filter((l) => /^cpu\d+/.test(l)).length || 1;
      } catch (e) {
        return 1;
      }
    }

    _updateMetrics() {
      this._updateCpuUsage();
      this._updateMemoryAndSwap();
      this._updateLoadAverage();
      this._updateBatteryAndPower();
    }

    _updateCpuUsage() {
      try {
        const [success, content] = GLib.file_get_contents("/proc/stat");
        if (!success) return;
        const lines = new TextDecoder().decode(content).split("\n");
        for (const line of lines) {
          const fields = line.trim().split(/\s+/);
          if (fields[0] !== "cpu") continue;
          const nums = fields.slice(1).map(Number);
          const idle = nums[3];
          const iowait = nums[4] || 0;
          const currentTotal =
            nums.slice(0, 4).reduce((a, b) => a + b, 0) + iowait;
          const currentUsed = currentTotal - idle - iowait;

          if (this._prevTotal > 0) {
            const totalDiff = currentTotal - this._prevTotal;
            const usedDiff = currentUsed - this._prevUsed;
            if (totalDiff > 0)
              this._cpuLabel.text = `CPU: ${((usedDiff / totalDiff) * 100).toFixed(0)}%`;
          }
          this._prevTotal = currentTotal;
          this._prevUsed = currentUsed;
          break;
        }
      } catch (e) {}
    }

    _updateMemoryAndSwap() {
      try {
        const [success, content] = GLib.file_get_contents("/proc/meminfo");
        if (!success) return;
        const lines = new TextDecoder().decode(content).split("\n");
        let mem = {},
          swp = {};
        lines.forEach((l) => {
          const p = l.split(/\s+/);
          if (l.startsWith("MemTotal:")) mem.total = parseInt(p[1]);
          if (l.startsWith("MemAvailable:")) mem.avail = parseInt(p[1]);
          if (l.startsWith("SwapTotal:")) swp.total = parseInt(p[1]);
          if (l.startsWith("SwapFree:")) swp.free = parseInt(p[1]);
        });

        if (mem.total && mem.avail)
          this._memLabel.text = `Mem: ${(((mem.total - mem.avail) / mem.total) * 100).toFixed(0)}%`;

        if (swp.total > 0) {
          const swpUsage = ((swp.total - swp.free) / swp.total) * 100;
          this._swapLabel.text = `SWP: ${swpUsage.toFixed(0)}%`;
        }
      } catch (e) {}
    }

    _updateLoadAverage() {
      try {
        const [success, content] = GLib.file_get_contents("/proc/loadavg");
        if (success) {
          const load1Min = parseFloat(
            new TextDecoder().decode(content).split(/\s+/)[0],
          );
          const loadPercent = (load1Min / this._cpuCount) * 100;
          this._loadLabel.text = `L: ${loadPercent.toFixed(0)}%`;
        }
      } catch (e) {}
    }

    _updateBatteryAndPower() {
      try {
        const batPath = "/sys/class/power_supply/BAT1/";
        const readBat = (name) => {
          try {
            const [success, content] = GLib.file_get_contents(batPath + name);
            return success ? new TextDecoder().decode(content).trim() : null;
          } catch (e) {
            return null;
          }
        };

        const status = readBat("status");
        const capacity = readBat("capacity") || "0";
        const voltage = parseInt(readBat("voltage_now")) || 0;
        const current = parseInt(readBat("current_now")) || 0;
        const chargeNow = parseInt(readBat("charge_now")) || 0;
        const chargeFull = parseInt(readBat("charge_full")) || 1;
        const chargeDesign = parseInt(readBat("charge_full_design")) || 1;

        let timeStr = "";
        if (this._settings.get_boolean("show-time") && current > 0) {
          const hours =
            status === "Discharging"
              ? chargeNow / current
              : (chargeFull - chargeNow) / current;
          timeStr = ` (${this._formatTime(hours)})`;
        }

        const watts = (voltage * current) / 1e12;
        this._powerLabel.text = `${watts.toFixed(0)}W`;
        const icon =
          status === "Charging" ? "⚡" : parseInt(capacity) > 80 ? " " : " ";
        this._batteryLabel.text = `${icon}${capacity}%${timeStr}`;

        this._healthItem.label.text = `Battery health: ${Math.round((chargeFull / chargeDesign) * 100)}%`;
        this._cyclesItem.label.text = `Completed cycles: ${readBat("cycle_count") || "--"}`;

        const startT = readBat("charge_control_start_threshold");
        const endT = readBat("charge_control_end_threshold");
        this._thresholdItem.label.text =
          startT && endT ? `Limits: ${startT}% - ${endT}%` : "Limits: N/A";
      } catch (e) {
        this._powerLabel.text = "Pwr: N/A";
      }
    }

    _formatTime(h) {
      if (h <= 0 || isNaN(h)) return "--h--";
      const m = Math.floor(h * 60);
      return `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, "0")}`;
    }

    _updateVisibility() {
      this._cpuLabel.visible = this._settings.get_boolean("show-cpu");
      this._memLabel.visible = this._settings.get_boolean("show-mem");
      this._powerLabel.visible = this._settings.get_boolean("show-watts");
      this._swapLabel.visible = this._settings.get_boolean("show-swap");
      this._loadLabel.visible = this._settings.get_boolean("show-load");
      this._updateMetrics();
    }

    _connectSettings() {
      const keys = [
        "show-cpu",
        "show-mem",
        "show-swap",
        "show-load",
        "show-watts",
        "show-time",
      ];
      keys.forEach((k) =>
        this._settings.connect(`changed::${k}`, () => this._updateVisibility()),
      );
      this._settings.connect("changed::update-interval", () =>
        this._scheduleUpdate(),
      );
    }

    _scheduleUpdate(first = false) {
      if (this._timeoutId) GLib.source_remove(this._timeoutId);
      if (!first) this._updateMetrics();
      this._timeoutId = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT_IDLE,
        UPDATE_INTERVAL_SECONDS,
        () => {
          this._updateMetrics();
          return GLib.SOURCE_CONTINUE;
        },
      );
    }

    destroy() {
      if (this._timeoutId) GLib.source_remove(this._timeoutId);
      super.destroy();
    }
  },
);

export default class BobyMonitorExtension extends Extension {
  enable() {
    this._settings = this.getSettings(
      "org.gnome.shell.extensions.boby-monitor-indicator",
    );
    this._indicator = new SystemMonitorIndicator(this._settings);
    Main.panel.addToStatusArea(this.uuid, this._indicator, 0, "right");
    if (Main.panel.statusArea.quickSettings?._system)
      Main.panel.statusArea.quickSettings._system._indicator.hide();
  }

  disable() {
    if (this._settings) {
      this._settings.run_dispose();
      this._settings = null;
    }
    if (Main.panel.statusArea.quickSettings?._system)
      Main.panel.statusArea.quickSettings._system._indicator.show();
    this._indicator?.destroy();
    this._indicator = null;
  }
}
