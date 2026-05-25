const RATE = {
  low:  { bg: "#091518", border: "#265a68", text: "#4ac4d8", sub: "#2a7888" },
  mid:  { bg: "#181208", border: "#7a6030", text: "#e8b840", sub: "#a07828" },
  high: { bg: "#180a08", border: "#7a3828", text: "#e86848", sub: "#a04028" },
  none: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)", text: "#22c55e", sub: "#3a7238" },
};

function RateBadge({ rate, cap, color, label }) {
  const c = RATE[color];
  return (
    <div style={{
      display: "inline-flex", flexDirection: "column", alignItems: "center",
      padding: "8px 14px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 5,
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 19, fontWeight: 700, color: c.text, letterSpacing: 0.5 }}>
        {rate ?? label}
      </span>
      {cap && <span style={{ fontSize: 10, color: c.sub, letterSpacing: 0.5, marginTop: 2 }}>max {cap}</span>}
    </div>
  );
}

function ContinueTag({ label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4, padding: "4px 10px", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 4, color: "#f59e0b", fontSize: 11 }}>
      <span>↓</span><span>{label}</span>
    </div>
  );
}

function QBlock({ n, question, hint, children, indent }) {
  return (
    <div style={{ marginLeft: indent ? 28 : 0, borderLeft: indent ? "2px solid rgba(255,255,255,0.07)" : "none", paddingLeft: indent ? 16 : 0 }}>
      <div style={{ border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", background: "#161408", borderBottom: "1px solid #232328", display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
            background: "#232328", color: "#f59e0b", fontSize: 10, fontWeight: 600,
          }}>{n}</span>
          <div>
            <span style={{ fontSize: 13, color: "#d4d4d8" }}>{question}</span>
            {hint && <span style={{ fontSize: 11, color: "#52525b", marginLeft: 8 }}>{hint}</span>}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Answer({ label, sub, children, last, width }) {
  return (
    <div style={{
      flex: width ? `0 0 ${width}` : 1,
      minWidth: 140,
      padding: "14px 16px",
      borderRight: last ? "none" : "1px solid #232328",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div>
        <div style={{ fontSize: 13, color: "#d4d4d8", fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "#52525b", marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Arrow({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0 5px 8px", color: "#4a4430" }}>
      <span style={{ fontSize: 18 }}>↓</span>
      {label && <span style={{ fontSize: 10, color: "#52525b", letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</span>}
    </div>
  );
}

function FactRow({ icon, label, children }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "12px 0", borderBottom: "1px solid #1e1e10" }}>
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#71717a", marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 13, color: "#d4d4d8", lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );
}

export default function TobGuide() {
  return (
    <div style={{ maxWidth: 680, padding: "0 0 48px" }}>

      {/* ── Hero ── */}
      <div style={{ marginBottom: 32, padding: "18px 20px", background: "#18181b", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#71717a", marginBottom: 10 }}>What is TOB?</div>
        <p style={{ margin: 0, fontSize: 14, color: "#a1a1aa", lineHeight: 1.75 }}>
          The <strong style={{ color: "#d4d4d8" }}>Taks op Beursverrichtingen (TOB)</strong> is a Belgian tax on stock exchange transactions.
          It applies to every buy and sell you make through a foreign broker — and <strong style={{ color: "#d4d4d8" }}>your broker does not pay it for you</strong>.
          You must declare and pay it yourself, every month you have trades.
        </p>
      </div>

      {/* ══════════════════════════════════════════════
          DECISION TREE
      ══════════════════════════════════════════════ */}

      {/* Q1 — transaction type */}
      <QBlock n="1" question="What type of transaction is it?">
        <Answer label="BUY or SELL" sub="any stock, ETF, bond…">
          <ContinueTag label="TOB applies — continue below" />
        </Answer>
        <Answer label="Dividend, transfer, corporate action…" last>
          <RateBadge rate="No TOB" color="none" />
        </Answer>
      </QBlock>

      <Arrow label="for buy / sell" />

      {/* Q2 — instrument type */}
      <QBlock n="2" question="What type of instrument?">
        <Answer label="Bond or ETN" sub="government bonds, corporate bonds, exchange-traded notes">
          <RateBadge rate="0.12%" cap="€1,300" color="low" />
        </Answer>
        <Answer label="Stock or ETC" sub="shares in a company, commodity trackers like gold ETCs">
          <RateBadge rate="0.35%" cap="€1,600" color="mid" />
        </Answer>
        <Answer label="ETF or Fund" sub="index trackers, mutual funds, money market funds" last>
          <ContinueTag label="see Q3 below" />
        </Answer>
      </QBlock>

      <Arrow label="ETF / fund only" />

      {/* Q3 — accumulating? */}
      <QBlock n="3" question="Is the ETF or fund accumulating?" hint="(reinvests dividends internally)" indent>
        <Answer label="No — distributing" sub='Name contains "Dist", "D", pays out dividends'>
          <RateBadge rate="0.12%" cap="€1,300" color="low" />
        </Answer>
        <Answer label="Yes — accumulating" sub='Name contains "Acc", "C", "Cap", reinvests internally' last>
          <ContinueTag label="see Q4 below" />
        </Answer>
      </QBlock>

      <Arrow label="accumulating only" />

      {/* Q4 — FSMA list */}
      <QBlock n="4" question="Is it registered on the Belgian FSMA list?" hint="(Belgian-domiciled fund)" indent>
        <Answer label="Yes — FSMA-listed" sub="Belgian fund (e.g. some Belfius or Synateb funds)">
          <RateBadge rate="1.32%" cap="€4,000" color="high" />
        </Answer>
        <Answer label="No — not FSMA-listed" sub="Most ETFs: iShares, Vanguard, Xtrackers… domiciled in Ireland/Luxembourg" last>
          <RateBadge rate="0.12%" cap="€1,300" color="low" />
        </Answer>
      </QBlock>

      {/* ══════════════════════════════════════════════
          RATE CHEAT SHEET
      ══════════════════════════════════════════════ */}
      <div style={{ marginTop: 36 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#71717a", marginBottom: 12 }}>Rate summary</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { rate: "0.12%", cap: "max €1,300", color: "low",  desc: "Bonds · ETNs · All distributing ETFs/funds · Accumulating ETFs/funds not on FSMA list" },
            { rate: "0.35%", cap: "max €1,600", color: "mid",  desc: "Stocks (shares) · ETCs (commodity trackers)" },
            { rate: "1.32%", cap: "max €4,000", color: "high", desc: "Accumulating ETFs/funds on the Belgian FSMA list" },
          ].map(({ rate, cap, color, desc }) => {
            const c = RATE[color];
            return (
              <div key={rate} style={{ flex: "1 1 180px", padding: "14px 16px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: c.text }}>{rate}</span>
                  <span style={{ fontSize: 11, color: c.sub }}>{cap}</span>
                </div>
                <div style={{ fontSize: 12, color: "#71717a", lineHeight: 1.5 }}>{desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          KEY FACTS
      ══════════════════════════════════════════════ */}
      <div style={{ marginTop: 36, border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ padding: "10px 16px", background: "#161408", borderBottom: "1px solid #232328", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#71717a" }}>
          Key facts
        </div>
        <div style={{ padding: "0 16px" }}>
          <FactRow icon="📅" label="Deadline">
            Last working day of the <strong style={{ color: "#d4d4d8" }}>2nd month after</strong> your transaction.
            Example: a trade in January must be declared by the last working day of March.
          </FactRow>
          <FactRow icon="🖥️" label="Where to file & pay">
            <a href="https://divtax.minfin.fgov.be/" target="_blank" rel="noopener noreferrer" style={{ color: "#f59e0b", textDecoration: "none" }}>
              divtax.minfin.fgov.be
            </a>
            {" "}— the Belgian tax portal. You enter the number of transactions and taxable amount per article code.
          </FactRow>
          <FactRow icon="⚠️" label="Broker does not pay for you">
            Foreign brokers (Revolut, DEGIRO, Trading 212…) do <strong style={{ color: "#d4d4d8" }}>not</strong> withhold or declare TOB on your behalf.
            Belgian brokers typically do handle it, but double-check.
          </FactRow>
          <FactRow icon="🧮" label="How the cap works">
            The tax is rate × transaction amount, <strong style={{ color: "#d4d4d8" }}>capped per transaction</strong>.
            A single €500,000 stock buy is capped at €1,600 (0.35%), not €1,750.
          </FactRow>
          <FactRow icon="📋" label="Article codes on the form">
            The gov form asks for amounts per article — use the codes this app shows: art. 120, 1° (low/mid) or art. 120, 3° (high).
          </FactRow>
        </div>
      </div>

    </div>
  );
}
