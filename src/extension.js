/*
 * Linuxtricks Monitor Indicator
 *
 * Author: Adrien Linuxtricks (forked from Michael Knap)
 *
 * License: MIT License
 */

'use strict';

import GLib    from 'gi://GLib';
import Gio     from 'gi://Gio';
import St      from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main      from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension }  from 'resource:///org/gnome/shell/extensions/extension.js';

const UPDATE_INTERVAL_SECONDS = 1;

const SystemMonitorIndicator = GObject.registerClass(
class SystemMonitorIndicator extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'System Monitor Indicator', false);

        this._box = new St.BoxLayout();

        this._cpuLabel = new St.Label({
            text: 'CPU: --%',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-right: 12px;',
        });
        this._box.add_child(this._cpuLabel);

        this._memLabel = new St.Label({
            text: 'Mem: --%',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-right: 12px;',
        });
        this._box.add_child(this._memLabel);

        this._swapLabel = new St.Label({
            text: 'Swap: --%',
            y_align: Clutter.ActorAlign.CENTER,
            style: 'margin-right: 12px;',
        });
        this._box.add_child(this._swapLabel);
        
        this._loadLabel = new St.Label({
            text: 'Load: --%',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._box.add_child(this._loadLabel);

        this.add_child(this._box);

        // previous CPU totals for diff-based usage
        this._prevUsed  = 0;
        this._prevTotal = 0;
        this._timeoutId = 0;

        this._scheduleUpdate(true);
    }

    _scheduleUpdate(first = false) {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }

        if (!first)
            this._updateMetrics();

        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT_IDLE,
            UPDATE_INTERVAL_SECONDS,
            () => {
                this._updateMetrics();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _updateMetrics() {
        this._updateCpuUsage();
        this._updateMemoryUsage();
        this._updateLoadAverage();
    }

    _updateCpuUsage() {
        try {
            const file = Gio.File.new_for_path('/proc/stat');
            const [, content] = file.load_contents(null);

            const decoder = new TextDecoder('utf-8');
            const text = decoder.decode(content);
            const lines = text.split('\n');

            let currentCpuUsed = 0;
            let currentCpuTotal = 0;

            for (const line of lines) {
                const fields = line.trim().split(/\s+/);
                if (fields[0] !== 'cpu')
                    continue;

                const nums = fields.slice(1).map(Number);
                if (!nums.length)
                    break;

                const idle   = nums[3];
                const iowait = nums[4] || 0;

                currentCpuTotal = nums.slice(0, 4).reduce((a, b) => a + b, 0) + iowait;
                currentCpuUsed  = currentCpuTotal - idle - iowait;

                // First run: just prime baseline
                if (!this._prevTotal || !this._prevUsed) {
                    this._prevTotal = currentCpuTotal;
                    this._prevUsed  = currentCpuUsed;
                    this._cpuLabel.text = 'CPU: --%';
                    break;
                }

                const totalDiff = currentCpuTotal - this._prevTotal;
                const usedDiff  = currentCpuUsed  - this._prevUsed;

                if (totalDiff > 0) {
                    const usage = (usedDiff / totalDiff) * 100;
                    this._cpuLabel.text = `CPU: ${usage.toFixed(2)}%`;
                }

                this._prevTotal = currentCpuTotal;
                this._prevUsed  = currentCpuUsed;
                break; // only first "cpu" line
            }
        } catch (e) {
            logError(e, 'System Monitor Indicator: failed to update CPU usage');
        }
    }

    _updateMemoryUsage() {
        try {
            const file = Gio.File.new_for_path('/proc/meminfo');
            const [, content] = file.load_contents(null);

            const decoder = new TextDecoder('utf-8');
            const text = decoder.decode(content);
            const lines = text.split('\n');

            let memTotal    = null;
            let memAvail    = null;
            let swapTotal   = null;
            let swapFree    = null;

            for (const line of lines) {
                if (!line.includes(':'))
                    continue;

                let [key, value] = line.split(':');
                if (!value)
                    continue;

                value = parseInt(value.trim(), 10);
                if (Number.isNaN(value))
                    continue;

                switch (key) {
                    case 'MemTotal':
                        memTotal = value;
                        break;
                    case 'MemAvailable':
                        memAvail = value;
                        break;
                    case 'SwapTotal':
                        swapTotal = value;
                        break;
                    case 'SwapFree':
                        swapFree = value;
                        break;
                }
            }

            if (memTotal != null && memAvail != null) {
                const memUsed  = memTotal - memAvail;
                const memUsage = (memUsed / memTotal) * 100;
                this._memLabel.text = `Mem: ${memUsage.toFixed(2)}%`;
            } else {
                this._memLabel.text = 'Mem: --%';
            }

            if (swapTotal != null && swapTotal > 0 && swapFree != null) {
                const swapUsed  = swapTotal - swapFree;
                const swapUsage = (swapUsed / swapTotal) * 100;
                this._swapLabel.text = `Swap: ${swapUsage.toFixed(2)}%`;
                this._swapLabel.show();
            } else {
                this._swapLabel.text = 'Swap: --%';
                this._swapLabel.hide();
            }
        } catch (e) {
            logError(e, 'System Monitor Indicator: failed to update memory usage');
        }
    }
    
    _updateLoadAverage() {
    try {
        const file = Gio.File.new_for_path('/proc/loadavg');
        const [, content] = file.load_contents(null);
        
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(content);
        const fields = text.trim().split(/\s+/);

        // Charge à 1 minute
        const load1Min = parseFloat(fields[0]);

        // Lire le nombre de cœurs de CPU
        const cpuFile = Gio.File.new_for_path('/proc/stat');
        const [, cpuContent] = cpuFile.load_contents(null);
        const cpuDecoder = new TextDecoder('utf-8');
        const cpuText = cpuDecoder.decode(cpuContent);
        const cpuLines = cpuText.split('\n');
        
       let totalCpu = 0;

        for (const line of cpuLines) {
            const fields = line.trim().split(/\s+/);
            // Vérifier si la ligne commence par 'cpu' suivi d'un chiffre
            if(/^cpu\d+$/.test(fields[0])) {
                totalCpu++; // Incrémente le compteur pour chaque CPU
            } 
        }

        // Calcul du pourcentage de charge
        const loadPercentage = (load1Min / totalCpu) * 100;

        // Affichage
        this._loadLabel.text = `Load : ${loadPercentage.toFixed(2)}% (${load1Min.toFixed(2)})`;
        
       } catch (e) {
        logError(e, 'System Monitor Indicator: failed to update load average');
       }
    }


    destroy() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }

        super.destroy();
    }
});

export default class SystemMonitorExtension extends Extension {
    enable() {
        this._indicator = new SystemMonitorIndicator();
        //Main.panel.addToStatusArea(this.uuid, this._indicator);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, 'left');
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
