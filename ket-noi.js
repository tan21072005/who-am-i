"use strict";
window.requestApi = async (operation, data = {}) => {
  const response = await fetch("/api/" + operation, {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-Bong-Hoa": "1"},
    body: JSON.stringify(data),
    cache: "no-store",
    signal: AbortSignal.timeout(4500)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Không kết nối được với Bông Hoa.");
  return result;
};
