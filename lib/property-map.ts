export type PropertyAddress = { address: string; city: string; postalCode?: string };

export function propertyAddressLabel({ address, city, postalCode = "" }: PropertyAddress) {
  return [address.trim(), [postalCode.trim(), city.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

export function propertyMapSearchUrl(address: PropertyAddress) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(propertyAddressLabel(address))}`;
}

export function propertyMapEmbedUrl(address: PropertyAddress) {
  return `https://www.google.com/maps?q=${encodeURIComponent(propertyAddressLabel(address))}&output=embed`;
}
