import { describe, expect, it } from "vitest";
import { getSemesterExpiryDate, getSemesterExpiryLabel } from "./licensePeriod";

describe("validade do plano semestral por calendário", () => {
  it("vence em 30/06 para pagamentos confirmados no primeiro semestre", () => {
    expect(getSemesterExpiryDate(new Date("2026-03-15T15:00:00Z"))).toBe("2026-06-30");
    expect(getSemesterExpiryLabel(new Date("2026-06-30T15:00:00Z"))).toBe("30/06/2026");
  });

  it("vence em 31/12 para pagamentos confirmados no segundo semestre", () => {
    expect(getSemesterExpiryDate(new Date("2026-09-18T15:00:00Z"))).toBe("2026-12-31");
    expect(getSemesterExpiryDate(new Date("2027-07-01T15:00:00Z"))).toBe("2027-12-31");
  });
});
