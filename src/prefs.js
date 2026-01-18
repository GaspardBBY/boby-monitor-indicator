"use strict";

import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class SystemMonitorPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings(
      "org.gnome.shell.extensions.boby-monitor-indicator",
    );

    const page = new Adw.PreferencesPage();
    window.add(page);

    // --- SECTION: BAR ITEMS ---
    const groupItems = new Adw.PreferencesGroup({
      title: "Items to display in the bar",
      description: "Choose the metrics to monitor in real time",
    });
    page.add(groupItems);

    const createSwitch = (title, key) => {
      const row = new Adw.ActionRow({ title: title });
      const toggle = new Gtk.Switch({
        active: settings.get_boolean(key),
        valign: Gtk.Align.CENTER,
      });
      settings.bind(key, toggle, "active", Gio.SettingsBindFlags.DEFAULT);
      row.add_suffix(toggle);
      row.activatable_widget = toggle; // Allows clicking on the whole row
      return row;
    };

    groupItems.add(createSwitch("Show CPU (%)", "show-cpu"));
    groupItems.add(createSwitch("Show Memory (RAM)", "show-mem"));
    groupItems.add(createSwitch("Show Swap (Swap file)", "show-swap"));
    groupItems.add(createSwitch("Show System Load", "show-load"));
    groupItems.add(
      createSwitch("Show Power Consumption (Watts)", "show-watts"),
    );
    groupItems.add(createSwitch("Show Remaining Battery Time", "show-time"));

    // --- SECTION: GENERAL ---
    const groupGeneral = new Adw.PreferencesGroup({
      title: "General Settings",
    });
    page.add(groupGeneral);

    const rowInterval = new Adw.ActionRow({
      title: "Update interval (seconds)",
    });
    const spin = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 1,
        upper: 60,
        step_increment: 1,
      }),
      valign: Gtk.Align.CENTER,
    });

    settings.bind(
      "update-interval",
      spin.get_adjustment(),
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );

    rowInterval.add_suffix(spin);
    groupGeneral.add(rowInterval);
  }
}
