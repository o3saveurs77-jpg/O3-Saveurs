// Génère une référence de commande courte lisible (#A1B2).
export function makeRef() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return "#" + Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join("");
}
