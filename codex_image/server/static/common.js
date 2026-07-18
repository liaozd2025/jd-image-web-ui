export function cookieValue(name) {
  const item = document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.split("=")[1]) : "";
}
