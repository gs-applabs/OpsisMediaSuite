using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace MediaSuite.OpsisPlugin;

/// <summary>Card control: name, tagline, install state and a launch button. Used for the Opsis page and the widget.</summary>
public sealed class MediaSuiteCard : UserControl
{
    private readonly Label _title = new() { AutoSize = true, Font = new Font("Segoe UI", 14f, FontStyle.Bold) };
    private readonly Label _tagline = new() { AutoSize = true, MaximumSize = new Size(520, 0) };
    private readonly Label _status = new() { AutoSize = true, MaximumSize = new Size(520, 0) };
    private readonly Button _launch = new() { AutoSize = true, Padding = new Padding(10, 4, 10, 4), FlatStyle = FlatStyle.Flat };
    private readonly FlowLayoutPanel _flow = new() { Dock = DockStyle.Fill, FlowDirection = FlowDirection.TopDown, WrapContents = false, Padding = new Padding(16) };

    public MediaSuiteCard()
    {
        _launch.Click += (_, _) => Launch(true);
        _flow.Controls.AddRange(new Control[] { _title, _tagline, _status, _launch });
        Controls.Add(_flow);
        Dock = DockStyle.Fill;
        Apply();
    }

    public void Apply()
    {
        if (IsDisposed) return;
        void Do()
        {
            var el = MediaSuitePlugin.IsGreek;
            var exe = MediaSuiteLocator.Find();
            _title.Text = "Opsis Media Suite";
            _tagline.Text = el ? "Βελτιωτής ήχου, μετατροπέας και κωδικοποιητής βίντεο" : "Audio enhancer, converter and video encoder";
            _status.Text = exe != null ? (el ? "Εγκατεστημένο" : "Installed") : (el ? "Δεν βρέθηκε εγκατεστημένο — εγκαταστήστε το από το gs-applabs/OpsisMediaSuite" : "Not installed — get it from gs-applabs/OpsisMediaSuite");
            _launch.Text = el ? "Εκκίνηση" : "Launch";
            _launch.Enabled = exe != null;
            var (bg, fg, muted, accent) = MediaSuitePlugin.Colors;
            BackColor = bg; _flow.BackColor = bg;
            _title.ForeColor = fg; _tagline.ForeColor = muted; _status.ForeColor = muted;
            _launch.BackColor = accent; _launch.ForeColor = Color.White; _launch.FlatAppearance.BorderColor = accent;
        }
        if (InvokeRequired) { if (IsHandleCreated) BeginInvoke((Action)Do); } else Do();
    }

    private void Launch(bool report)
    {
        if (!LaunchInstalled(report)) Apply();
    }

    /// <summary>Starts the installed app (existence re-checked at click time). Never starts anything that is not the located Media Suite exe.</summary>
    internal static bool LaunchInstalled(bool report = false)
    {
        var exe = MediaSuiteLocator.Find();
        if (exe == null) return false;
        try { Process.Start(new ProcessStartInfo(exe) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(exe)! }); return true; }
        catch (Exception ex) { if (report) MessageBox.Show(ex.Message, "Opsis Media Suite", MessageBoxButtons.OK, MessageBoxIcon.Warning); return false; }
    }
}
