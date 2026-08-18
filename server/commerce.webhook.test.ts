import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleAsaasWebhook } from "./routers/commerce";
import * as db from "./db.licenses";
import { getSemesterExpiryDate } from "./licensePeriod";

vi.mock("./db.licenses", async (importOriginal) => {
  const actual = await importOriginal<typeof db>();
  return {
    ...actual,
    getAllLicenses: vi.fn(),
    updateLicense: vi.fn().mockResolvedValue(undefined),
    getLicensesByEmail: vi.fn().mockResolvedValue([]),
    getProductSettings: vi.fn().mockResolvedValue({ expiryDate: new Date("2026-12-31T00:00:00Z") }),
    activateLicenseByPayment: vi.fn().mockResolvedValue({ activated: true }),
  };
});

describe("handleAsaasWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ativa a licença quando o pagamento é confirmado e o externalReference contém o id da licença", async () => {
    (db.getAllLicenses as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 42, active: 0, email: "prof@escola.com", code: "PP-TESTE123", customerId: null, paymentId: "__pending__" },
    ]);

    await handleAsaasWebhook({
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_123", customer: "cus_9", externalReference: "pp-1000|42", status: "RECEIVED" },
    });

    expect(db.updateLicense).toHaveBeenCalledWith(42, {
      active: 1,
      startDate: expect.any(Date),
      expiresAt: getSemesterExpiryDate(),
      paymentId: "pay_123",
      customerId: "cus_9",
    });
  });

  it("é idempotente: não desativa uma licença já ativa recebendo o mesmo evento duas vezes", async () => {
    (db.getAllLicenses as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 42, active: 1, email: "prof@escola.com", code: "PP-TESTE123", customerId: null, paymentId: "pay_123" },
    ]);

    await handleAsaasWebhook({
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_123", customer: "cus_9", externalReference: "pp-1000|42", status: "RECEIVED" },
    });

    expect(db.updateLicense).not.toHaveBeenCalled();
  });

  it("ativa a licença pelo paymentId quando o externalReference não traz id de licença", async () => {
    (db.getAllLicenses as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 55, active: 0, email: "maria@escola.com", code: "PP-ABC", customerId: "cus_9", paymentId: "pay_777" },
    ]);

    await handleAsaasWebhook({
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_777", customer: "cus_9", externalReference: "pp-1000", status: "RECEIVED" },
    });

    expect(db.updateLicense).toHaveBeenCalledWith(55, expect.objectContaining({ active: 1 }));
  });

  it("ativa a licença quando o cartão é confirmado pelo Asaas", async () => {
    (db.getAllLicenses as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 81, active: 0, email: "cartao@escola.com", code: "PP-CARD", customerId: null, paymentId: "__pending__" },
    ]);

    await handleAsaasWebhook({
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay_card_1", customer: "cus_card", externalReference: "pp-2000|81", status: "CONFIRMED" },
    });

    expect(db.updateLicense).toHaveBeenCalledWith(81, expect.objectContaining({
      active: 1,
      paymentId: "pay_card_1",
      customerId: "cus_card",
    }));
  });

  it("revoga a licença se o Asaas reprovar a análise de risco do cartão", async () => {
    (db.getAllLicenses as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 91, active: 1, email: "risco@escola.com", code: "PP-RISCO", customerId: "cus_risk", paymentId: "pay_risk" },
    ]);

    await handleAsaasWebhook({
      event: "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
      payment: { id: "pay_risk", customer: "cus_risk", externalReference: "pp-3000|91", status: "REPROVED" },
    });

    expect(db.updateLicense).toHaveBeenCalledWith(91, { active: 0, paymentId: "pay_risk" });
  });

  it("ignora eventos que não representem aprovação ou revogação", async () => {
    await handleAsaasWebhook({ event: "PAYMENT_CONFIRMATION_WAITING", payment: { id: "pay_123" } });
    expect(db.updateLicense).not.toHaveBeenCalled();
  });

  it("ignora quando o id da licença no externalReference não existe", async () => {
    (db.getAllLicenses as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await handleAsaasWebhook({
      event: "PAYMENT_RECEIVED",
      payment: { id: "pay_123", customer: "cus_9", externalReference: "pp-1000|999", status: "RECEIVED" },
    });
    expect(db.updateLicense).not.toHaveBeenCalled();
  });
});
