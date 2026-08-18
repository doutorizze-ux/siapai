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

  it("ignora eventos que não sejam PAYMENT_RECEIVED", async () => {
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
