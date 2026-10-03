import { describe, expect, it } from "vitest";
import { aggregate, parseCsv, toSql } from "./build-migration.mjs";

const csv = `country_code,zipcode,place,state,state_code,province,province_code,community,community_code,latitude,longitude
DE,19205,Gadebusch,Mecklenburg-Vorpommern,MV,,00,Nordwestmecklenburg,13074,53.7014,11.1168
DE,19205,Pokrent,Mecklenburg-Vorpommern,MV,,00,Nordwestmecklenburg,13074,53.6489,11.1462
DE,10875,"Firma GmbH, Stuttgart",Baden-Württemberg,08,x,0,y,1,48.72,9.16
DE,23966,O'Wismar,Mecklenburg-Vorpommern,MV,,00,Nordwestmecklenburg,13074,53.892,11.4636
`;

describe("PLZ-Daten", () => {
  it("nur Zustell-PLZ, Mittelwert, erster Ort", () => {
    const e = aggregate(parseCsv(csv));
    expect(e).toEqual([
      { plz: "19205", place: "Gadebusch", state: "Mecklenburg-Vorpommern", lat: 53.6752, lon: 11.1315 },
      { plz: "23966", place: "O'Wismar", state: "Mecklenburg-Vorpommern", lat: 53.892, lon: 11.4636 },
    ]);
  });
  it("SQL mit maskierten Anführungszeichen", () => {
    const sql = toSql(aggregate(parseCsv(csv)));
    expect(sql).toContain("('23966', 'O''Wismar', 53.892, 11.4636, 'Mecklenburg-Vorpommern')");
    expect(sql).toContain("on conflict (postal_code) do update");
    expect(sql).toContain("CC BY 4.0");
  });
});
