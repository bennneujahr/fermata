"use client";
// Bestellung (PLAN 2.3 Nr. 7): Stripe Payment Element im Modus „Abo“ ohne Client-Geheimnis (deferred intent),
// Pflicht-Häkchen „vorzeitiger Beginn“ direkt über dem Knopf, Knopf mit festem Wortlaut (§ 312j Abs. 3 BGB).
// Klick → elements.submit() → billing-checkout {action: "order", start_request: true} → stripe.confirmPayment().
// Stripe.js wird erst hier geladen (ohne „advanced fraud signals“), die CSP erlaubt Stripe nur auf dieser Seite.
import type { Stripe, StripeElements, StripePaymentElement } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import { useEffect, useId, useRef, useState } from "react";
import { orderMembership } from "@/app/actions/billing";
import { Button, Checkbox, Notice } from "@/components/ui";
import { errors as commonErrors } from "@/copy/common";
import type { AddressForm } from "@/copy/form";
import { LABELS, order as orderCopy } from "@/copy/mitgliedschaft";
import "./mitgliedschaft.css";

type Phase = "idle" | "submitting" | "paying" | "failed";

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function OrderForm({
  form,
  tier,
  summaryHash,
  amount,
  currency,
  startRequestText,
  publishableKey,
  resultPath,
}: {
  form: AddressForm;
  tier: string;
  summaryHash: string;
  amount: number;
  currency: string;
  startRequestText: string;
  publishableKey: string | null;
  /** Ergebnisseite (Rücksprung von Stripe, z. B. nach 3-D Secure). */
  resultPath: string;
}) {
  const c = orderCopy(form);
  const uid = useId();
  const mountRef = useRef<HTMLDivElement>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [paymentState, setPaymentState] = useState<"loading" | "ready" | "error" | "off">(publishableKey ? "loading" : "off");
  const [startRequest, setStartRequest] = useState(false);
  const [checkboxError, setCheckboxError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const checkboxId = `${uid}-start`;

  useEffect(() => {
    if (!publishableKey) return;
    let element: StripePaymentElement | null = null;
    let cancelled = false;
    loadStripe.setLoadParameters({ advancedFraudSignals: false });
    loadStripe(publishableKey, { locale: "de" })
      .then((stripe) => {
        if (cancelled || !stripe || !mountRef.current) return;
        stripeRef.current = stripe;
        const elements = stripe.elements({
          mode: "subscription",
          amount,
          currency,
          locale: "de",
          appearance: {
            theme: "stripe",
            variables: {
              colorPrimary: cssVar("--color-wine", "#7A2638"),
              colorBackground: cssVar("--color-paper-raised", "#FBF8F2"),
              colorText: cssVar("--color-ink", "#1E1A2B"),
              colorDanger: cssVar("--color-danger", "#A12E28"),
              fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
              borderRadius: "12px",
              spacingUnit: "4px",
            },
          },
        });
        elementsRef.current = elements;
        element = elements.create("payment", { layout: "tabs" });
        element.on("ready", () => !cancelled && setPaymentState("ready"));
        element.on("loaderror", () => !cancelled && setPaymentState("error"));
        element.mount(mountRef.current);
      })
      .catch(() => !cancelled && setPaymentState("error"));
    return () => {
      cancelled = true;
      element?.destroy();
    };
  }, [publishableKey, amount, currency]);

  async function onOrder() {
    setError(null);
    if (!startRequest) {
      setCheckboxError(c.startRequestRequired);
      document.getElementById(checkboxId)?.focus();
      return;
    }
    setCheckboxError(null);
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    setPhase("submitting");
    try {
      if (publishableKey) {
        if (!stripe || !elements || paymentState !== "ready") {
          setPhase("idle");
          setError(c.paymentUnavailable);
          return;
        }
        // Eingaben im Zahlungsfeld prüfen (Stripe zeigt Fehler direkt im Feld).
        const { error: submitError } = await elements.submit();
        if (submitError) {
          setPhase("idle");
          if (submitError.type !== "validation_error") setError(submitError.message ?? commonErrors.generic(form));
          return;
        }
      }
      const res = await orderMembership({ tier, summaryHash, requestId: crypto.randomUUID(), startRequest: true });
      if (!res.ok) {
        setPhase("idle");
        setError(c.errors[res.error] ?? commonErrors.generic(form));
        return;
      }
      const result = new URL(resultPath, window.location.origin);
      result.searchParams.set("vertrag", res.data.contractNumber);
      if (stripe && elements && res.data.clientSecret) {
        setPhase("paying");
        const { error: payError } = await stripe.confirmPayment({
          elements,
          clientSecret: res.data.clientSecret,
          confirmParams: { return_url: result.toString() },
          redirect: "if_required",
        });
        if (payError) {
          setPhase("failed");
          setError(payError.message ?? c.paymentFailedText);
          return;
        }
      }
      result.searchParams.set("redirect_status", "succeeded");
      window.location.assign(result.toString());
    } catch {
      setPhase("idle");
      setError(commonErrors.generic(form));
    }
  }

  const busy = phase === "submitting" || phase === "paying";
  return (
    <div className="stack">
      <section className="stack stack-sm" aria-labelledby={`${uid}-pay`}>
        <h2 id={`${uid}-pay`}>{c.paymentTitle}</h2>
        <p className="soft">{c.paymentText}</p>
        {paymentState === "off" ? (
          <Notice tone="warning">{c.paymentNotConfigured}</Notice>
        ) : (
          <div className="payment-box" aria-busy={paymentState === "loading" || undefined}>
            {paymentState === "loading" ? <p className="muted text-sm">{c.paymentLoading}</p> : null}
            {paymentState === "error" ? <p className="field__error">{c.paymentUnavailable}</p> : null}
            <div ref={mountRef} data-testid="payment-element" />
          </div>
        )}
      </section>

      <div className="order-confirm">
        <Checkbox
          id={checkboxId}
          label={startRequestText}
          checked={startRequest}
          onChange={(e) => {
            setStartRequest(e.target.checked);
            if (e.target.checked) setCheckboxError(null);
          }}
          error={checkboxError}
          required
          aria-required="true"
        />
        {phase === "failed" ? (
          <Notice tone="danger" title={c.paymentFailedTitle} live="assertive">
            <p>{error}</p>
            <p>{c.paymentFailedText}</p>
          </Notice>
        ) : error ? (
          <Notice tone="danger" live="assertive">
            {error}
          </Notice>
        ) : null}
        <Button
          type="button"
          block
          onClick={onOrder}
          loading={busy}
          aria-disabled={!startRequest || undefined}
          aria-describedby={`${uid}-after`}
        >
          {LABELS.orderButton}
        </Button>
        <p className="soft text-sm" id={`${uid}-after`} role="status">
          {phase === "submitting" ? c.submitting : phase === "paying" ? c.paying : c.afterButton}
        </p>
      </div>
    </div>
  );
}
