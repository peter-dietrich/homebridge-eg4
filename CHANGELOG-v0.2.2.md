# v0.2.2-dev.1

- Add native HomeKit `ContactSensor` service named `Grid Connection`.
- Make Grid Connection the primary HomeKit service so Apple Home has a supported tile type.
- Preserve native Battery service for SOC, Charging State, and Low Battery.
- Link the Battery service to Grid Connection.
- Determine grid availability from GridBOSS RMS voltage rather than instantaneous grid watts.
- Add Status Active / Status Fault to Grid Connection.
- Extend polling log with GridVoltage and GridConnected.
- No control/write operations added.
