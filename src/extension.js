/*
 * Linuxtricks Monitor Indicator
 *
 * Author: Adrien Linuxtricks (forked from Michael Knap)
 *
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
    _init() {
      super._init(0.0, "System Monitor Indicator", false);

      this._box = new St.BoxLayout();
      const labelStyle = "margin-right: 12px; font-family: monospace;";

      // --- STATUS BAR (What is always visible) ---
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

      // --- MENU SECTION (What appears on click) ---
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

      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      this._modelItem = new PopupMenu.PopupMenuItem("Model: --", {
        reactive: false,
      });
      this.menu.addMenuItem(this._modelItem);

      this._prevUsed = 0;
      this._prevTotal = 0;
      this._timeoutId = 0;
      this._scheduleUpdate(true);
    }

    _updateBatteryAndPower() {
      try {
        const batPath = "/sys/class/power_supply/BAT1/";
        const readBat = (name) => {
          try {
            const f = Gio.File.new_for_path(batPath + name);
            const [, c] = f.load_contents(null);
            return new TextDecoder().decode(c).trim();
          } catch (e) {
            return null;
          }
        };

        const status = readBat("status");
        const capacity = readBat("capacity");
        const voltage = parseInt(readBat("voltage_now"));
        const current = parseInt(readBat("current_now"));
        const chargeNow = parseInt(readBat("charge_now"));
        const chargeFull = parseInt(readBat("charge_full"));
        const chargeDesign = parseInt(readBat("charge_full_design"));
        const cycles = readBat("cycle_count");
        const model = readBat("model_name");

        // 1. CALCULATE REMAINING TIME
        let timeStr = "";
        if (current > 0) {
          if (status === "Discharging") {
            const hours = chargeNow / current;
            timeStr = ` (${this._formatTime(hours)})`;
          } else if (status === "Charging") {
            const hours = (chargeFull - chargeNow) / current;
            timeStr = ` (End: ${this._formatTime(hours)})`;
          }
        }

        // 2. UPDATE STATUS BAR
        const watts = (voltage * current) / 1000000000000;
        this._powerLabel.text = `${watts.toFixed(0)}W`;

        const icon =
          status === "Charging" ? "⚡" : parseInt(capacity) > 80 ? " " : " ";
        this._batteryLabel.text = `${icon}${capacity}%${timeStr}`;

        // 3. UPDATE MENU
        if (chargeFull && chargeDesign) {
          const health = Math.round((chargeFull / chargeDesign) * 100);
          this._healthItem.label.text = `Battery health: ${health}%`;
        }
        this._cyclesItem.label.text = `Completed cycles: ${cycles || "--"}`;
        this._modelItem.label.text = `Model: ${model || "--"}`;

        const startT = readBat("charge_control_start_threshold");
        const endT = readBat("charge_control_end_threshold");
        if (startT && endT) {
          this._thresholdItem.label.text = `Charge limits: ${startT}% - ${endT}%`;
        } else {
          this._thresholdItem.label.text = "Limits: Not supported";
        }
      } catch (e) {
        this._powerLabel.text = "Pwr: N/A";
      }
    }

    _formatTime(hoursFloat) {
      if (hoursFloat <= 0 || isNaN(hoursFloat)) return "--h--";
      const totalMin = Math.floor(hoursFloat * 60);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return `${h}h${m.toString().padStart(2, "0")}`;
    }

    _updateCpuUsage() {
      try {
        const file = Gio.File.new_for_path("/proc/stat");
        const [, content] = file.load_contents(null);
        const lines = new TextDecoder().decode(content).split("\n");
        for (const line of lines) {
          const fields = line.trim().split(/\s+/);
          if (fields[0] !== "cpu") continue;
          const nums = fields.slice(1).map(Number);
          const idle = nums[3];
          const iowait = nums[4] || 0;
          const currentCpuTotal =
            nums.slice(0, 4).reduce((a, b) => a + b, 0) + iowait;
          const currentCpuUsed = currentCpuTotal - idle - iowait;
          if (this._prevTotal > 0) {
            const totalDiff = currentCpuTotal - this._prevTotal;
            const usedDiff = currentCpuUsed - this._prevUsed;
            if (totalDiff > 0)
              this._cpuLabel.text = `CPU: ${((usedDiff / totalDiff) * 100).toFixed(0)}%`;
          }
          this._prevTotal = currentCpuTotal;
          this._prevUsed = currentCpuUsed;
          break;
        }
      } catch (e) {}
    }

    _updateMemoryUsage() {
      try {
        const file = Gio.File.new_for_path("/proc/meminfo");
        const [, content] = file.load_contents(null);
        const lines = new TextDecoder().decode(content).split("\n");
        let total, avail;
        lines.forEach((l) => {
          if (l.startsWith("MemTotal:")) total = parseInt(l.split(/\s+/)[1]);
          if (l.startsWith("MemAvailable:"))
            avail = parseInt(l.split(/\s+/)[1]);
        });
        if (total && avail)
          this._memLabel.text = `Mem: ${(((total - avail) / total) * 100).toFixed(0)}%`;
      } catch (e) {}
    }

    _updateMetrics() {
      this._updateCpuUsage();
      this._updateMemoryUsage();
      this._updateBatteryAndPower();
    }

    _scheduleUpdate(first = false) {
      if (this._timeoutId) {
        GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
      }
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

export default class SystemMonitorExtension extends Extension {
  enable() {
    this._indicator = new SystemMonitorIndicator();
    Main.panel.addToStatusArea(this.uuid, this._indicator, 0, "right");
  }
}
