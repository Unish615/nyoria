import React, { useState, useEffect } from "react";
import ToolWrapper from "../ToolWrapper";
import { Download, QrCode, Check, RefreshCw, Copy } from "lucide-react";
import QRCode from "qrcode";
import confetti from "canvas-confetti";

export default function QrGenerator({ onBack }) {
  const [qrType, setQrType] = useState("url"); // url, text, wifi, contact, esewa

  // Inputs
  const [url, setUrl] = useState("https://google.com");
  const [text, setText] = useState("Hello NYORIA!");

  // WiFi Inputs
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [encryption, setEncryption] = useState("WPA");

  // Contact Inputs
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");

  // eSewa Payment Inputs
  const [esewaAmount, setEsewaAmount] = useState("");
  const [esewaMerchant, setEsewaMerchant] = useState("");
  const [esewaProductId, setEsewaProductId] = useState("");
  const [esewaSuccessUrl, setEsewaSuccessUrl] = useState("https://example.com/success");
  const [esewaFailureUrl, setEsewaFailureUrl] = useState("https://example.com/failure");

  // Styling
  const [fgColor, setFgColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [margin, setMargin] = useState(4);

  const [qrUrl, setQrUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generatePayload = () => {
    switch (qrType) {
      case "url":
        return url;
      case "text":
        return text;
      case "wifi":
        return `WIFI:S:${ssid};T:${encryption};P:${password};;`;
      case "contact":
        return `BEGIN:VCARD\nVERSION:3.0\nN:${name}\nORG:${org}\nTEL:${phone}\nEMAIL:${email}\nEND:VCARD`;
      case "esewa": {
        const params = new URLSearchParams();
        if (esewaAmount.trim()) params.set("amt", esewaAmount.trim());
        if (esewaMerchant.trim()) params.set("scd", esewaMerchant.trim());
        if (esewaProductId.trim()) params.set("pid", esewaProductId.trim());
        if (esewaSuccessUrl.trim()) params.set("su", esewaSuccessUrl.trim());
        if (esewaFailureUrl.trim()) params.set("fu", esewaFailureUrl.trim());
        return `esewa://pay?${params.toString()}`;
      }
      default:
        return "";
    }
  };

  const drawQrCode = async () => {
    setError("");
    const payload = generatePayload();
    if (!payload.trim()) {
      setQrUrl("");
      return;
    }

    try {
      const dataUrl = await QRCode.toDataURL(payload, {
        width: 320,
        margin: margin,
        color: {
          dark: fgColor,
          light: bgColor,
        },
      });
      setQrUrl(dataUrl);
    } catch (e) {
      setError("Failed to generate QR Code. " + e.message);
    }
  };

  useEffect(() => {
    drawQrCode();
  }, [
    qrType,
    url,
    text,
    ssid,
    password,
    encryption,
    name,
    phone,
    email,
    org,
    esewaAmount,
    esewaMerchant,
    esewaProductId,
    esewaSuccessUrl,
    esewaFailureUrl,
    fgColor,
    bgColor,
    margin,
  ]);

  const handleDownload = () => {
    if (!qrUrl) return;
    confetti({
      particleCount: 40,
      angle: 90,
      spread: 30,
    });
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = `qrcode-${Date.now()}.png`;
    link.click();

    // Log to history
    const history = JSON.parse(localStorage.getItem("nyoria_history") || "[]");
    history.unshift({
      toolName: "QR Generator",
      fileName: `qrcode-${Date.now()}.png`,
      originalSize: 0,
      finalSize: qrUrl.length,
      timestamp: Date.now(),
    });
    localStorage.setItem("nyoria_history", JSON.stringify(history.slice(0, 50)));
    window.dispatchEvent(new Event("history_updated"));
  };

  return (
    <ToolWrapper
      id="qr-generator"
      title="QR Code Generator"
      description="Create customized QR codes for URLs, WiFi configurations, plain texts, vCard contacts, or eSewa payments."
      onBack={onBack}
    >
      <div className="grid gap-8 lg:grid-cols-3 animate-floatUp">
        {/* Input Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex rounded-xl border border-slate-700 dark:border-slate-800 p-0.5 bg-[#111827]/40 dark:bg-[#111827]/10">
            {[
              { id: "url", label: "URL Link" },
              { id: "text", label: "Plain Text" },
              { id: "wifi", label: "Wi-Fi Config" },
              { id: "contact", label: "vCard Contact" },
              { id: "esewa", label: "eSewa Payment" },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setQrType(m.id)}
                className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-all ${qrType === m.id
                  ? "bg-slate-900 text-white dark:bg-[#111827]/10 dark:text-white"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-950/10 dark:hover:bg-[#111827]/10"
                  }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="p-6 rounded-3xl bg-[#111827]/40 dark:bg-[#111827]/10 border border-slate-700 dark:border-slate-800 space-y-4">
            {qrType === "url" && (
              <div className="space-y-2">
                <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">
                  Destination URL Link
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none focus:border-cyan-400 text-xs"
                />
              </div>
            )}

            {qrType === "text" && (
              <div className="space-y-2">
                <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">
                  Plain Text Payload
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Enter text metadata to display..."
                  className="w-full h-24 px-4 py-2.5 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none focus:border-cyan-400 text-xs resize-none"
                />
              </div>
            )}

            {qrType === "wifi" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">Network SSID Name</label>
                    <input
                      type="text"
                      value={ssid}
                      onChange={(e) => setSsid(e.target.value)}
                      placeholder="MyNetworkName"
                      className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">SSID Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Network Password"
                      className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">Security Protocol</label>
                  <select
                    value={encryption}
                    onChange={(e) => setEncryption(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none text-xs"
                  >
                    <option value="WPA">WPA/WPA2</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">Unsecured (No Password)</option>
                  </select>
                </div>
              </div>
            )}

            {qrType === "contact" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">Contact Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 555-0199"
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="johndoe@email.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">Organization / Title</label>
                  <input
                    type="text"
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    placeholder="Acme Corp"
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none text-xs"
                  />
                </div>
              </div>
            )}

            {qrType === "esewa" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">Payment Amount</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={esewaAmount}
                      onChange={(e) => setEsewaAmount(e.target.value)}
                      placeholder="100.00"
                      className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">Merchant Code (scd)</label>
                    <input
                      type="text"
                      value={esewaMerchant}
                      onChange={(e) => setEsewaMerchant(e.target.value)}
                      placeholder="merchant123"
                      className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none text-xs"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">Product / Invoice ID (pid)</label>
                  <input
                    type="text"
                    value={esewaProductId}
                    onChange={(e) => setEsewaProductId(e.target.value)}
                    placeholder="order-456"
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none text-xs"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">Success URL</label>
                    <input
                      type="url"
                      value={esewaSuccessUrl}
                      onChange={(e) => setEsewaSuccessUrl(e.target.value)}
                      placeholder="https://example.com/success"
                      className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-slate-200 dark:text-slate-400 font-semibold">Failure URL</label>
                    <input
                      type="url"
                      value={esewaFailureUrl}
                      onChange={(e) => setEsewaFailureUrl(e.target.value)}
                      placeholder="https://example.com/failure"
                      className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-[#111827] dark:border-slate-800 dark:bg-[#0B0F1A] text-slate-900 dark:text-white outline-none text-xs"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  eSewa payment QR payload follows the format: <code>esewa://pay?amt=...&scd=...&pid=...&su=...&fu=...</code>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Preview & Style Panel */}
        <div className="p-6 rounded-3xl bg-[#111827]/70 border border-white/10 space-y-6 text-white flex flex-col justify-between">
          <div className="space-y-6">
            <h3 className="text-base font-bold text-white flex items-center space-x-2">
              <QrCode className="w-5 h-5 text-cyan-400" />
              <span>QR Code Canvas</span>
            </h3>

            {qrUrl ? (
              <div className="p-4 bg-[#111827] rounded-2xl flex justify-center items-center shadow-lg border border-slate-800 w-full max-w-[240px] mx-auto">
                <img src={qrUrl} alt="QR Code" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="h-44 w-full rounded-2xl border border-dashed border-slate-750 flex items-center justify-center text-xs text-slate-400">
                Awaiting input data...
              </div>
            )}

            {/* Controls */}
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-400 font-semibold uppercase">Foreground</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer bg-transparent border border-slate-750"
                    />
                    <span className="text-[10px] font-mono">{fgColor}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-400 font-semibold uppercase">Background</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-7 h-7 rounded cursor-pointer bg-transparent border border-slate-750"
                    />
                    <span className="text-[10px] font-mono">{bgColor}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-slate-400 font-semibold uppercase">
                  <label>Quiet Zone Margin</label>
                  <span>{margin}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={margin}
                  onChange={(e) => setMargin(parseInt(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-4">
            {error && <div className="text-xs text-cyan-400 font-medium">{error}</div>}

            <button
              onClick={handleDownload}
              disabled={!qrUrl}
              className="flex w-full items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-400 py-3 font-bold text-white transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Download QR PNG</span>
            </button>
          </div>
        </div>
      </div>
    </ToolWrapper>
  );
}
