using System.Buffers.Binary;
using System.Runtime.InteropServices;
using NAudio.Dsp;
using NAudio.Wave;

sealed class TaskbarSpectrum : IDisposable
{
    private const int SampleCount = 2048;
    private const int FftPower = 11;
    private static readonly int[] BandEdges = [44, 88, 176, 352, 704, 1408, 2816, 5632, 11264];
    private static readonly Guid FloatFormat = new("00000003-0000-0010-8000-00aa00389b71");
    private static readonly Guid PcmFormat = new("00000001-0000-0010-8000-00aa00389b71");
    private static readonly double[] Window = Enumerable.Range(0, SampleCount)
        .Select(index => FastFourierTransform.HannWindow(index, SampleCount)).ToArray();
    private WasapiLoopbackCapture? capture;
    private volatile bool captureStopped;
    private long retryAt;
    private Frame? latest;

    private sealed record Frame(long Time, double[] Levels);

    public void SetActive(bool active)
    {
        if (!active) { Stop(); return; }
        if (captureStopped) Stop();
        if (capture is not null || Environment.TickCount64 < retryAt) return;

        try
        {
            var device = new WasapiLoopbackCapture();
            capture = device;
            var format = device.WaveFormat;
            bool floatingPoint = format.Encoding == WaveFormatEncoding.IeeeFloat ||
                format is WaveFormatExtensible extFloat && extFloat.SubFormat == FloatFormat;
            bool pcm = format.Encoding == WaveFormatEncoding.Pcm ||
                format is WaveFormatExtensible extPcm && extPcm.SubFormat == PcmFormat;
            int bits = format.BitsPerSample;
            if (!(floatingPoint && bits == 32 || pcm && bits is 16 or 24 or 32))
            {
                Stop();
                return;
            }

            var samples = new Complex[SampleCount];
            int sampleIndex = 0;
            int bytesPerChannel = bits / 8;
            device.DataAvailable += (_, args) =>
            {
                var buffer = args.Buffer.AsSpan(0, args.BytesRecorded);
                for (int frame = 0; frame + format.BlockAlign <= buffer.Length; frame += format.BlockAlign)
                {
                    double sum = 0;
                    for (int channel = 0; channel < format.Channels; channel++)
                    {
                        var sample = buffer.Slice(frame + channel * bytesPerChannel, bytesPerChannel);
                        sum += floatingPoint ? BitConverter.ToSingle(sample) : ReadPcm(sample);
                    }
                    samples[sampleIndex] = new Complex { X = (float)(sum * Window[sampleIndex] / format.Channels) };
                    if (++sampleIndex != SampleCount) continue;
                    Volatile.Write(ref latest, new Frame(Environment.TickCount64, Analyze(samples, format.SampleRate)));
                    sampleIndex = 0;
                }
            };
            device.RecordingStopped += (_, _) => captureStopped = true;
            device.StartRecording();
        }
        catch (Exception error) when (error is COMException or InvalidOperationException or ArgumentException
            or System.ComponentModel.Win32Exception or NotSupportedException)
        {
            Stop();
        }
    }

    private static double ReadPcm(ReadOnlySpan<byte> sample) => sample.Length switch
    {
        2 => BinaryPrimitives.ReadInt16LittleEndian(sample) / 32768.0,
        3 => ((sample[0] << 8) | (sample[1] << 16) | (sample[2] << 24)) / 2147483648.0,
        _ => BinaryPrimitives.ReadInt32LittleEndian(sample) / 2147483648.0,
    };

    private static double[] Analyze(Complex[] samples, int sampleRate)
    {
        FastFourierTransform.FFT(true, FftPower, samples);
        double[] levels = new double[BandEdges.Length - 1];
        for (int band = 0; band < levels.Length; band++)
        {
            int start = Math.Min(SampleCount / 2, (int)Math.Ceiling(BandEdges[band] * SampleCount / (double)sampleRate));
            int end = Math.Min(SampleCount / 2, (int)Math.Ceiling(BandEdges[band + 1] * SampleCount / (double)sampleRate));
            double peak = 0;
            for (int bin = start; bin < end; bin++)
            {
                var value = samples[bin];
                peak = Math.Max(peak, value.X * value.X + value.Y * value.Y);
            }
            levels[band] = Math.Min(1, Math.Sqrt(Math.Sqrt(peak) * 10));
        }
        return levels;
    }

    public static void Verify()
    {
        const int sampleRate = 48000;
        var samples = new Complex[SampleCount];
        for (int i = 0; i < samples.Length; i++)
            samples[i].X = (float)(Math.Sin(2 * Math.PI * 880 * i / sampleRate) * Window[i]);
        var levels = Analyze(samples, sampleRate);
        if (levels[4] < 0.6 || levels[0] > 0.1 || levels[7] > 0.1)
            throw new InvalidOperationException("The taskbar spectrum must put an 880 Hz tone in its own band");
    }

    public ReadOnlySpan<double> Levels(double[] fallback)
    {
        if (capture is null) return fallback;
        var frame = Volatile.Read(ref latest);
        return frame is not null && Environment.TickCount64 - frame.Time < 180 ? frame.Levels : [];
    }

    private void Stop()
    {
        var device = capture;
        capture = null;
        captureStopped = false;
        if (device is null) return;
        retryAt = Environment.TickCount64 + 1500;
        device.Dispose();
        Volatile.Write(ref latest, null);
    }

    public void Dispose() => Stop();
}
