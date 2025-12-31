export const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount)
}

// Format large numbers in compact form (Rp 17.6M, Rp 235.7JT)
export const formatCurrencyCompact = (amount: number) => {
    if (amount >= 1000000000000) {
        return `Rp ${(amount / 1000000000000).toFixed(1)}T`
    }
    if (amount >= 1000000000) {
        return `Rp ${(amount / 1000000000).toFixed(1)}M`
    }
    if (amount >= 1000000) {
        return `Rp ${(amount / 1000000).toFixed(1)}JT`
    }
    if (amount >= 1000) {
        return `Rp ${(amount / 1000).toFixed(1)}RB`
    }
    return `Rp ${amount}`
}


export const parseNumber = (text: string): number => {
    if (!text) return 0
    const clean = text.replace(/[^\d.,kKmM]/g, "")

    if (clean.toLowerCase().includes("k")) return parseFloat(clean) * 1000
    if (clean.toLowerCase().includes("m")) return parseFloat(clean) * 1000000
    if (text.toLowerCase().includes("rb")) return parseFloat(clean.replace(",", ".")) * 1000
    if (text.toLowerCase().includes("jt")) return parseFloat(clean.replace(",", ".")) * 1000000

    return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0
}

interface ShopBaseData {
    data: {
        shopid: number
        name: string
        follower_count: number
        item_count: number
        rating_star: number
        ctime: number
        response_rate: number
    }
}

interface ShopItemsData {
    items: Array<{
        item_basic: {
            itemid: number
            name: string
            currency: string
            price: number
            price_min: number
            price_max: number
            sold: number
            historical_sold: number
            liked_count: number
            cmt_count: number
            stock: number
            image: string
        }
    }>
}

export const fetchShopInfo = async (username: string): Promise<ShopBaseData | null> => {
    try {
        const res = await fetch(`https://shopee.co.id/api/v4/shop/get_shop_base?username=${username}`)
        const json = await res.json()
        return json
    } catch (e) {
        console.error("Failed to fetch shop info", e)
        return null
    }
}

export const fetchShopProducts = async (shopId: number, limit = 30): Promise<ShopItemsData | null> => {
    try {
        // Use version=2 and simplest params to try to avoid blocks
        const res = await fetch(`https://shopee.co.id/api/v4/search/search_items?by=pop&limit=${limit}&match_id=${shopId}&newest=0&order=desc&page_type=shop&scenario=PAGE_OTHERS&version=2`)
        const json = await res.json()
        return json
    } catch (e) {
        console.error("Failed to fetch shop products", e)
        return null
    }
}

interface ProductDetailData {
    data: {
        itemid: number
        shopid: number
        name: string
        price: number
        historical_sold: number
        sold: number
        stock: number
        item_status: string
        liked_count: number
        cmt_count: number
    }
}

export const fetchProductDetail = async (shopId: number, itemId: number): Promise<ProductDetailData | null> => {
    try {
        const res = await fetch(`https://shopee.co.id/api/v4/item/get?itemid=${itemId}&shopid=${shopId}`)
        const json = await res.json()
        return json
    } catch (e) {
        console.error("Failed to fetch product detail", e)
        return null
    }
}
