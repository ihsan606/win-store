export const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount)
}

export const parseNumber = (text: string): number => {
    if (!text) return 0
    const clean = text.replace(/[^\d.,kKmM]/g, "")

    if (clean.toLowerCase().includes("k")) {
        return parseFloat(clean) * 1000
    }
    if (clean.toLowerCase().includes("m")) { // j for juta in indonesian context usually, but shopee uses k/jt sometimes
        // Shopee ID usually uses "rb" for thousands and "jt" for millions if localized, or k/m.
        // Let's handle basic k/m first.
        return parseFloat(clean) * 1000000
    }

    // Hande "rb" (thousands) and "jt" (millions) common in ID
    if (text.toLowerCase().includes("rb")) {
        return parseFloat(clean.replace(",", ".")) * 1000
    }
    if (text.toLowerCase().includes("jt")) {
        return parseFloat(clean.replace(",", ".")) * 1000000
    }

    return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Helper to get Shopee's __INITIAL_STATE__ if available
// Note: Direct access to window variables from content script requires world: "MAIN" configuration in Plasmo
export const getShopeeInitialState = () => {
    // This needs to be run in the MAIN world.
    // We might need to inject a script to get this if we stick to ISOLATED content scripts.
    // For now, let's try DOM scraping which is safer for content scripts without "world: MAIN".
    return null
}
