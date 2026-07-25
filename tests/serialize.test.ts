import { describe, it, expect } from "vitest";
import { rowToDish, dishToRow, rowToZone, rowToOrder, rowToUser } from "@/lib/serialize";

describe("rowToDish", () => {
  it("désérialise les champs JSON (tags, options, formules)", () => {
    const row = {
      id: "d1",
      cat: "africaine",
      name: "Tcheb Poulet",
      desc: "Riz au gras",
      price: 11,
      photo: "/photos/p04.jpg",
      badge: null,
      popular: true,
      available: true,
      spice: 0,
      tags: '["Populaire"]',
      options: '[{"name":"Riz","required":true,"choices":[{"l":"Riz blanc"}]}]',
      formules: null,
    };
    const d = rowToDish(row);
    expect(d.name).toBe("Tcheb Poulet");
    expect(d.tags).toEqual(["Populaire"]);
    expect(d.options[0].name).toBe("Riz");
    expect(d.formules).toBeUndefined();
  });

  it("tolère un JSON corrompu en renvoyant un défaut", () => {
    const d = rowToDish({ id: "x", cat: "c", name: "n", desc: "", price: null, tags: "{bad", options: "nope", popular: false, available: true, spice: 0 });
    expect(d.tags).toEqual([]);
    expect(d.options).toEqual([]);
  });
});

describe("dishToRow", () => {
  it("sérialise tags/options/formules en JSON et ignore les champs absents", () => {
    const row = dishToRow({ name: "X", tags: ["a", "b"], formules: [["Seul", 7]] });
    expect(row.name).toBe("X");
    expect(row.tags).toBe('["a","b"]');
    expect(row.formules).toBe('[["Seul",7]]');
    expect("price" in row).toBe(false);
  });

  it("met formules à null quand undefined explicite", () => {
    const row = dishToRow({ formules: undefined });
    expect("formules" in row).toBe(false);
  });
});

describe("rowToZone", () => {
  it("mappe minimum -> min et parse cities", () => {
    const z = rowToZone({ fee: 2.5, minimum: 15, cities: '["Lognes","Torcy"]' });
    expect(z).toEqual({ fee: 2.5, min: 15, villes: ["Lognes", "Torcy"] });
  });
});

describe("rowToOrder", () => {
  it("reconstruit la commande et le client, parse lines, convertit la date", () => {
    const ts = "2026-06-01T12:00:00.000Z";
    const o = rowToOrder({
      id: "o1",
      ref: "#AB12",
      lines: '[{"key":"k","dishId":"d1","name":"Tcheb","photo":null,"unitPrice":11,"qty":2,"opts":{},"formule":null,"note":""}]',
      mode: "livraison",
      zoneIdx: 0,
      slot: "asap",
      customerName: "Awa",
      customerEmail: "awa@x.fr",
      customerPhone: "06",
      address: "1 rue",
      city: "Lognes",
      zip: "77185",
      subtotal: 22,
      fee: 2.5,
      total: 24.5,
      status: "confirmee",
      paid: true,
      paymentMethod: "Carte",
      driver: null,
      createdAt: ts,
    });
    expect(o.lines).toHaveLength(1);
    expect(o.lines[0].qty).toBe(2);
    expect(o.customer.name).toBe("Awa");
    expect(o.total).toBe(24.5);
    expect(o.createdAt).toBe(new Date(ts).getTime());
  });
});

describe("rowToUser", () => {
  it("parse favorites et addresses", () => {
    const u = rowToUser({
      name: "Awa",
      email: "awa@x.fr",
      phone: "06",
      favorites: '["d1","d2"]',
      addresses: '[{"id":"a1","label":"Domicile","address":"1 rue","zip":"77185","city":"Lognes"}]',
    });
    expect(u.favorites).toEqual(["d1", "d2"]);
    expect(u.addresses[0].city).toBe("Lognes");
  });
});
