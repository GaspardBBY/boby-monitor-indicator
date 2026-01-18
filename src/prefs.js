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
    const group = new Adw.PreferencesGroup({
      title: "Items to show in the bar",
    });
    window.add(page);
    page.add(group);

    const createSwitch = (title, key) => {
      const row = new Adw.ActionRow({ title: title });
      const toggle = new Gtk.Switch({
        active: settings.get_boolean(key),
        valign: Gtk.Align.CENTER,
      });
      settings.bind(key, toggle, "active", Gio.SettingsBindFlags.DEFAULT);
      row.add_suffix(toggle);
      return row;
    };

    group.add(createSwitch("Show CPU", "show-cpu"));
    group.add(createSwitch("Show Memory", "show-mem"));
    group.add(createSwitch("Show Power Consumption (Watts)", "show-watts"));
    group.add(createSwitch("Show Remaining Battery Time", "show-time"));

    const groupGeneral = new Adw.PreferencesGroup({ title: "General" });
    page.add(groupGeneral);

    const rowInterval = new Adw.ActionRow({
      title: "Update interval (sec)",
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
