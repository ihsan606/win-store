// Background script using Chrome Debugger API
// Captures ALL product data from Shopee API responses (Passive Only)

interface ShopData {
    shopInfo?: any
    products: Map<number, any>  // itemid -> product data
    totalCaptured: number
    totalExpected: number
}

const shopDataByTab: Record<number, ShopData> = {}

// Cache for category data (to solve race condition)
const categoryDataByTab: Record<number, {
    products: any[]
    officialStores: any[]
    totalCount: number
    timestamp: number
}> = {}

// Cache for search data (to solve race condition)
const searchDataByTab: Record<number, {
    items: any[]
    totalCount: number
    timestamp: number
}> = {}

// Attach debugger to a tab
const attachDebugger = async (tabId: number) => {
    try {
        await chrome.debugger.attach({ tabId }, "1.3")
        await chrome.debugger.sendCommand({ tabId }, "Network.enable")
        console.log(`🔧 Debugger attached to tab ${tabId}`)

        // Initialize shop data for this tab
        if (!shopDataByTab[tabId]) {
            shopDataByTab[tabId] = {
                products: new Map(),
                totalCaptured: 0,
                totalExpected: 0
            }
        }
    } catch (e: any) {
        if (!e.message?.includes("already attached")) {
            console.error("Debugger attach error:", e)
        }
    }
}

// Listen for debugger events
chrome.debugger.onEvent.addListener((source, method, params: any) => {
    const tabId = source.tabId!

    if (method === "Network.responseReceived") {
        const url = params.response?.url || ""

        // Capture Shop Base Info
        if (url.includes("/api/v4/shop/get_shop_base")) {
            console.log("[API] Captured shop base response")
            getResponseBody(tabId, params.requestId, "shop")
        }

        // Capture Product Detail Page (PDP) API
        if (url.includes("/api/v4/pdp/get_pc")) {
            console.log("[API] Captured PDP response (product detail)")
            getResponseBody(tabId, params.requestId, "pdp")
        }

        // Capture Search Results for Keyword Research (handle both search stats and products)
        if (url.includes("/api/v4/search/search_items")) {
            console.log("[API] Captured SEARCH response for keyword research")
            getResponseBody(tabId, params.requestId, "search")
            return // Don't process again as "products"
        }

        // Capture Category Landing Page for Category Research
        if (url.includes("/api/v4/recommend/recommend_v2")) {
            console.log("[API] Captured CATEGORY LANDING PAGE response")
            getResponseBody(tabId, params.requestId, "category")
            return // Don't process again as "products"
        }

        // Capture Product Search/List (passive capture from OTHER endpoints, NOT search_items)
        if (url.includes("/api/v4/recommend/recommend") ||
            url.includes("/api/v4/shop/rcmd_items") ||
            url.includes("/api/v4/pdp/list_by_category") ||
            url.includes("shop_page_category_tab") ||
            url.includes("/api/v4/pages/get_homepage_category_list")) {
            console.log("[API] Captured products response from:", url.split("?")[0])
            getResponseBody(tabId, params.requestId, "products")
        }
    }
})

// Parse sold count text like "10RB+ terjual" to number
const parseSoldText = (text: string): number => {
    if (!text) return 0
    const match = text.match(/(\d+(?:[.,]\d+)?)\s*(RB|JT)?/i)
    if (!match) return 0

    let num = parseFloat(match[1].replace(",", "."))
    const unit = match[2]?.toUpperCase()

    if (unit === "JT") num *= 1000000
    else if (unit === "RB") num *= 1000

    return Math.round(num)
}

// Process items and add to store
const processItems = (tabId: number, items: any[], totalFromApi?: number) => {
    if (!shopDataByTab[tabId]) {
        shopDataByTab[tabId] = {
            products: new Map(),
            totalCaptured: 0,
            totalExpected: 0
        }
    }

    if (totalFromApi) {
        shopDataByTab[tabId].totalExpected = totalFromApi
    }

    items.forEach((item: any) => {
        const itemId = item.itemid || item.item_id
        if (!itemId) return

        // Extract price (new format uses item_card_display_price)
        const priceInfo = item.item_card_display_price || {}
        let price = priceInfo.price || item.price || 0
        let strikethroughPrice = priceInfo.strikethrough_price || 0

        // Shopee stores prices in smallest unit
        if (price > 1000000) {
            price = price / 100000
            strikethroughPrice = strikethroughPrice / 100000
        }

        // Extract sold count
        const soldInfo = item.item_card_display_sold_count || {}
        const historicalSoldText = soldInfo.historical_sold_count_text || ""
        const monthlySoldText = soldInfo.monthly_sold_count_text || ""
        const historicalSold = parseSoldText(historicalSoldText) || item.historical_sold || 0
        const monthlySold = parseSoldText(monthlySoldText) || 0

        // Extract rating
        const ratingInfo = item.item_rating || {}
        const ratingCount = ratingInfo.rating_count?.[0] || 0

        // Extract display info
        const displayAsset = item.item_card_displayed_asset || {}

        // Store/update product data
        shopDataByTab[tabId].products.set(itemId, {
            itemid: itemId,
            shopid: item.shopid,
            name: displayAsset.name || item.name || "",

            // Prices
            price: price,
            original_price: strikethroughPrice || price,
            discount: priceInfo.discount || item.discount || 0,

            // Sales
            historical_sold: historicalSold,
            historical_sold_text: historicalSoldText,
            monthly_sold: monthlySold,
            monthly_sold_text: monthlySoldText,

            // Stock and rating
            stock: item.stock || 0,
            rating_star: ratingInfo.rating_star || 0,
            rating_count: ratingCount,

            // Engagement
            liked_count: item.liked_count || 0,
            comment_count: item.cmt_count || 0,

            // Meta
            image: displayAsset.image || item.image || "",
            ctime: item.ctime || 0,
            catid: item.catid || 0,
            brand: item.global_brand?.display_name || item.brand || ""
        })
    })

    shopDataByTab[tabId].totalCaptured = shopDataByTab[tabId].products.size
}

// Get the response body from debugger with retry
const getResponseBody = async (tabId: number, requestId: string, type: string, retryCount = 0) => {
    const MAX_RETRIES = 3
    const RETRY_DELAY = 200 // ms

    try {
        // Small delay to let response complete
        if (retryCount === 0) {
            await new Promise(r => setTimeout(r, 100))
        }

        const result = await chrome.debugger.sendCommand(
            { tabId },
            "Network.getResponseBody",
            { requestId }
        ) as { body: string }

        const data = JSON.parse(result.body)

        if (!shopDataByTab[tabId]) {
            shopDataByTab[tabId] = {
                products: new Map(),
                totalCaptured: 0,
                totalExpected: 0
            }
        }


        if (type === "shop" && data.data) {
            shopDataByTab[tabId].shopInfo = data.data
            console.log("[OK] Shop info captured:", data.data.name, "ID:", data.data.shopid)
            notifyContentScript(tabId)
        }

        if (type === "products") {
            // Extract items from various response structures
            let items: any[] = []
            let total = 0

            if (data.data?.centralize_item_card?.item_cards) {
                items = data.data.centralize_item_card.item_cards
                total = data.data.total || 0
            } else if (data.data?.items) {
                items = data.data.items
                total = data.data?.total || 0
            } else if (data.items) {
                items = data.items
            }

            const beforeCount = shopDataByTab[tabId].products.size

            if (items.length > 0) {
                // Log itemIds from this page
                const itemIds = items.map((item: any) => item.itemid || item.item_id).filter(Boolean)
                console.log(`📦 Page itemIds received (${itemIds.length} items):`, itemIds)
                console.log(`📦 Page itemIds as string:`, itemIds.join(', '))

                processItems(tabId, items, total)
                const afterCount = shopDataByTab[tabId].products.size
                const newItems = afterCount - beforeCount
                console.log(`✅ Captured ${items.length} items (${newItems} new). Total: ${afterCount}/${shopDataByTab[tabId].totalExpected || '?'}`)

                // Log details for each item from this page
                console.group(`📋 Detail items dari page ini:`)
                items.forEach((item: any, index: number) => {
                    const itemId = item.itemid || item.item_id
                    const name = item.item_card_displayed_asset?.name || item.name || 'N/A'
                    const soldInfo = item.item_card_display_sold_count || {}
                    const soldText = soldInfo.historical_sold_count_text || item.historical_sold || 'N/A'
                    console.log(`  [${index + 1}] ID: ${itemId} | Terjual: ${soldText} | Nama: ${name.substring(0, 50)}...`)
                })
                console.groupEnd()

                notifyContentScript(tabId)
            }
        }

        // Handle Search Results for Keyword Research
        if (type === "search") {
            let items: any[] = []
            let totalCount = 0

            // Extract items from search response - check multiple structures
            if (data.data?.centralize_item_card?.item_cards) {
                items = data.data.centralize_item_card.item_cards
                totalCount = data.data.total || data.data.total_count || items.length
            } else if (data.data?.items) {
                items = data.data.items.map((item: any) => item.item_basic || item).filter(Boolean)
                totalCount = data.data.total_count || data.data.total || items.length
            } else if (data.items) {
                items = data.items.map((item: any) => item.item_basic || item).filter(Boolean)
                totalCount = data.total_count || items.length
            }

            if (items.length > 0) {
                // Cache search data for this tab (to solve race condition)
                searchDataByTab[tabId] = {
                    items: items,
                    totalCount: totalCount,
                    timestamp: Date.now()
                }

                // Send search data to content script
                try {
                    await chrome.tabs.sendMessage(tabId, {
                        type: "SHOPEE_SEARCH_UPDATE",
                        data: searchDataByTab[tabId]
                    })
                } catch (e) {
                    // Content script might not be ready - data is cached for later
                    console.log("[SEARCH] Content script not ready, data cached for later")
                }
            }
        }

        // Handle Category Landing Page for Category Research
        if (type === "category") {
            const units = data.data?.units || []
            const totalCount = data.data?.total || 0

            if (units.length > 0) {
                // Parse products and identify official stores
                const products: any[] = []
                const officialStoresMap = new Map<number, any>()

                units.forEach((unit: any) => {
                    if (unit.data_type !== "item" || !unit.item) return

                    const itemData = unit.item.item_data || {}
                    const displayAsset = unit.item.item_card_displayed_asset || {}
                    const shopData = itemData.shop_data || {}
                    const sellerFlag = displayAsset.seller_flag?.name || ""
                    const isOfficialShop = sellerFlag === "OFFICIAL_SHOP"

                    // Extract price
                    const priceInfo = itemData.item_card_display_price || {}
                    let price = priceInfo.price || 0
                    let originalPrice = priceInfo.strikethrough_price || price
                    if (price > 1000000) {
                        price = price / 100000
                        originalPrice = originalPrice / 100000
                    }

                    // Extract sold count
                    const soldInfo = itemData.item_card_display_sold_count || {}
                    const historicalSoldText = soldInfo.historical_sold_count_text || ""
                    const monthlySoldText = soldInfo.monthly_sold_count_text || ""
                    const historicalSold = parseSoldText(historicalSoldText)
                    const monthlySold = parseSoldText(monthlySoldText)

                    // Extract rating
                    const ratingInfo = itemData.item_rating || {}
                    const rating = ratingInfo.rating_star || 0
                    const ratingCount = ratingInfo.rating_count?.[0] || 0

                    const product = {
                        itemid: itemData.itemid,
                        shopid: itemData.shopid,
                        name: displayAsset.name || "",
                        image: displayAsset.image || "",
                        price: price,
                        originalPrice: originalPrice,
                        discount: priceInfo.discount || 0,
                        historicalSold: historicalSold,
                        historicalSoldText: historicalSoldText,
                        monthlySold: monthlySold,
                        monthlySoldText: monthlySoldText,
                        rating: rating,
                        ratingCount: ratingCount,
                        likedCount: itemData.liked_count || 0,
                        isOfficialShop: isOfficialShop,
                        isPreferredPlus: sellerFlag === "PREFERRED_PLUS",
                        shopName: shopData.shop_name || "",
                        shopLocation: shopData.shop_location || ""
                    }

                    products.push(product)

                    // Track official stores
                    if (isOfficialShop && itemData.shopid) {
                        const existing = officialStoresMap.get(itemData.shopid)
                        if (existing) {
                            existing.productCount++
                            existing.totalSold += historicalSold
                            existing.totalRating += rating
                            existing.ratingSum++
                        } else {
                            officialStoresMap.set(itemData.shopid, {
                                shopid: itemData.shopid,
                                shopName: shopData.shop_name || "",
                                shopLocation: shopData.shop_location || "",
                                productCount: 1,
                                totalSold: historicalSold,
                                totalRating: rating,
                                ratingSum: 1
                            })
                        }
                    }
                })

                // Convert official stores map to array with avg rating
                const officialStores = Array.from(officialStoresMap.values()).map(store => ({
                    ...store,
                    avgRating: store.ratingSum > 0 ? store.totalRating / store.ratingSum : 0
                })).sort((a, b) => b.productCount - a.productCount)

                console.log(`[CATEGORY] Parsed ${products.length} products, ${officialStores.length} official stores`)

                // Cache category data for this tab (to solve race condition)
                categoryDataByTab[tabId] = {
                    products: products,
                    officialStores: officialStores,
                    totalCount: totalCount,
                    timestamp: Date.now()
                }

                // Send to content script
                try {
                    await chrome.tabs.sendMessage(tabId, {
                        type: "SHOPEE_CATEGORY_UPDATE",
                        data: categoryDataByTab[tabId]
                    })
                } catch (e) {
                    // Content script might not be ready - data is cached for later request
                    console.log("[CATEGORY] Content script not ready, data cached for later")
                }
            }
        }

        // Handle PDP (Product Detail Page) data
        if (type === "pdp" && data.data) {
            const pdpData = data.data

            // Get additional data from nested objects
            const item = pdpData.item || pdpData
            const productReview = pdpData.product_review || {}
            const shopData = pdpData.shop || {}

            console.log("[DATA] PDP Data received:", item.title?.substring(0, 50) || item.name?.substring(0, 50))

            // Extract product info with all insights data
            const productInfo = {
                itemid: item.item_id || item.itemid,
                shopid: item.shop_id || item.shopid,
                name: item.title || item.name || "",

                // Price info (prices in API are multiplied by 100000)
                price: item.price ? item.price / 100000 : 0,
                price_min: item.price_min ? item.price_min / 100000 : 0,
                price_max: item.price_max ? item.price_max / 100000 : 0,
                price_before_discount: item.price_before_discount ? item.price_before_discount / 100000 : 0,
                discount: item.raw_discount || item.show_discount || 0,

                // Stock info
                stock: item.stock || item.normal_stock || 0,
                normal_stock: item.normal_stock || 0,

                // Sales info - prefer product_review data
                historical_sold: productReview.historical_sold || item.historical_sold || 0,
                historical_sold_display: productReview.historical_sold_display || "",
                sold: item.sold || 0,

                // Rating info - use product_review for full distribution
                rating_star: productReview.rating_star || item.item_rating?.rating_star || 0,
                // rating_count: [total, 1star, 2star, 3star, 4star, 5star]
                rating_count: productReview.rating_count || item.item_rating?.rating_count || [0, 0, 0, 0, 0, 0],
                total_rating_count: productReview.total_rating_count || 0,

                // Engagement - prefer product_review data
                liked_count: productReview.liked_count || item.liked_count || 0,
                cmt_count: productReview.cmt_count || item.cmt_count || 0,
                view_count: item.view_count || 0,

                // Timestamps
                ctime: item.ctime || 0,

                // Category & Brand
                catid: item.cat_id || item.catid || 0,
                categories: item.categories || item.fe_categories || [],
                brand: item.brand || "",
                brand_id: item.brand_id || 0,

                // Images
                image: item.image || "",
                images: pdpData.product_images?.images || item.images || [],

                // Shop info - combine shop_info and shop data
                shop_info: {
                    shopid: shopData.shop_id || item.shop_id,
                    username: shopData.username || "",
                    name: shopData.name || "",
                    is_official_shop: shopData.is_official_shop || false,
                    is_preferred_plus: shopData.is_preferred_plus || false,
                    is_shopee_verified: shopData.is_shopee_verified || false,
                    last_active_time: shopData.last_active_time || 0,
                    vacation: shopData.vacation || false
                },

                // Models/Variants - with full data
                models: (item.models || []).map((m: any) => ({
                    modelid: m.model_id || m.modelid,
                    name: m.name || "",
                    price: m.price ? m.price / 100000 : 0,
                    price_before_discount: m.price_before_discount ? m.price_before_discount / 100000 : 0,
                    stock: m.stock || m.normal_stock || 0,
                    sold: m.sold || 0
                })),

                // Tier variations (size, color, etc.)
                tier_variations: item.tier_variations || [],

                // Pre-order info
                is_pre_order: item.is_pre_order || false,
                estimated_days: item.estimated_days || 0,

                // Location
                shop_location: item.shop_location || ""
            }

            // Log summary
            console.log("[OK] PDP Processed:", {
                name: productInfo.name.substring(0, 30),
                price: `${productInfo.price_min} - ${productInfo.price_max}`,
                stock: productInfo.stock,
                historical_sold: productInfo.historical_sold,
                rating: productInfo.rating_star.toFixed(2),
                liked: productInfo.liked_count,
                variants: productInfo.models.length,
                ctime: new Date(productInfo.ctime * 1000).toLocaleDateString()
            })

            // Log variant breakdown
            if (productInfo.models.length > 0) {
                console.group("📦 Variant Breakdown:")
                productInfo.models
                    .sort((a: any, b: any) => b.sold - a.sold)
                    .forEach((m: any, i: number) => {
                        console.log(`  ${i + 1}. ${m.name}: Sold ${m.sold}, Stock ${m.stock}, Rp${m.price.toLocaleString()}`)
                    })
                console.groupEnd()
            }

            // Send PDP data to content script
            chrome.tabs.sendMessage(tabId, {
                type: "SHOPEE_PDP_UPDATE",
                data: productInfo
            }).catch(() => {
                // Content script might not be ready, ignore
            })
        }

    } catch (e: any) {
        const errorMessage = e.message || JSON.stringify(e)

        // Retry if response not available yet
        if (errorMessage.includes("No data found") && retryCount < MAX_RETRIES) {
            console.log(`[RETRY] getResponseBody for "${type}" - attempt ${retryCount + 1}/${MAX_RETRIES}`)
            await new Promise(r => setTimeout(r, RETRY_DELAY))
            return getResponseBody(tabId, requestId, type, retryCount + 1)
        }

        // Log error if all retries failed
        console.log(`[ERROR] getResponseBody failed for type "${type}":`, errorMessage)
    }
}

// Notify content script of updated data
const notifyContentScript = (tabId: number) => {
    const data = shopDataByTab[tabId]
    if (!data) return

    // Convert Map to array for sending
    const productsArray = Array.from(data.products.values())

    chrome.tabs.sendMessage(tabId, {
        type: "SHOPEE_DATA_UPDATE",
        data: {
            shopInfo: data.shopInfo,
            products: productsArray,
            totalProducts: productsArray.length,
            totalExpected: data.totalExpected
        }
    }).catch(() => {
        // Content script might not be ready, ignore
    })
}

// Auto-attach when navigating to Shopee
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "loading" && tab.url?.includes("shopee.co.id")) {
        // Reset data for new page load
        shopDataByTab[tabId] = {
            products: new Map(),
            totalCaptured: 0,
            totalExpected: 0
        }
        attachDebugger(tabId)
    }
})

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
    delete shopDataByTab[tabId]
    try {
        chrome.debugger.detach({ tabId })
    } catch (e) { }
})

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const tabId = sender.tab?.id
    if (!tabId) return true

    if (message.type === "GET_CAPTURED_DATA") {
        // Ensure debugger is attached when content script asks for data
        if (!shopDataByTab[tabId]) {
            attachDebugger(tabId)
        }

        const data = shopDataByTab[tabId]
        if (data) {
            const productsArray = Array.from(data.products.values())
            sendResponse({
                data: {
                    shopInfo: data.shopInfo,
                    products: productsArray,
                    totalProducts: productsArray.length,
                    totalExpected: data.totalExpected
                }
            })
        } else {
            sendResponse({ data: null })
        }
    }

    // Force refresh - re-attach debugger to capture fresh data
    if (message.type === "FORCE_REFRESH_CAPTURE") {
        console.log("[INFO] Force refresh capture requested")
        shopDataByTab[tabId] = {
            products: new Map(),
            totalCaptured: 0,
            totalExpected: 0
        }
        attachDebugger(tabId)
        sendResponse({ success: true })
    }

    // Get cached category data (to solve race condition)
    if (message.type === "GET_CATEGORY_DATA") {
        const cachedData = categoryDataByTab[tabId]
        if (cachedData) {
            console.log("[CATEGORY] Sending cached data to content script:", cachedData.products.length, "products")
            sendResponse({ data: cachedData })
        } else {
            console.log("[CATEGORY] No cached data available")
            sendResponse({ data: null })
        }
    }

    // Get cached search data (to solve race condition)
    if (message.type === "GET_SEARCH_DATA") {
        const cachedData = searchDataByTab[tabId]
        if (cachedData) {
            console.log("[SEARCH] Sending cached data to content script:", cachedData.items.length, "items")
            sendResponse({ data: cachedData })
        } else {
            console.log("[SEARCH] No cached data available")
            sendResponse({ data: null })
        }
    }

    // Fetch PDP data from local API (proxy for content script)
    if (message.type === "FETCH_PDP") {
        const { shopId, itemId } = message
        const apiUrl = `http://127.0.0.1:5555/api/v4/pdp/get?item_id=${itemId}&shop_id=${shopId}`

        console.log("[INFO] ======== BACKGROUND: FETCH_PDP ========")
        console.log("[SHOP] Shop ID:", shopId)
        console.log("[DATA] Item ID:", itemId)
        console.log("[URL] API URL:", apiUrl)

        fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + btoa('root:insignia2023')
            }
        })
            .then(response => {
                console.log("[API] Response Status:", response.status, response.statusText)
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`)
                }
                return response.json()
            })
            .then(result => {
                console.log("[DEBUG] Raw API result:", result)

                // Handle nested structure: data.item contains item info
                const itemData = result.data?.item || result.data || result
                const reviewData = result.data?.product_review || {}
                const shopData = result.data?.shop || {}

                // Merge all data together for easier processing
                const data = {
                    ...itemData,
                    // Add review data
                    historical_sold: reviewData.historical_sold || itemData.historical_sold || 0,
                    rating_star: reviewData.rating_star || itemData.item_rating?.rating_star || 0,
                    rating_count: reviewData.rating_count || itemData.rating_count || [0, 0, 0, 0, 0, 0],
                    cmt_count: reviewData.cmt_count || itemData.cmt_count || 0,
                    liked_count: reviewData.liked_count || itemData.liked_count || 0,
                    // Add shop data
                    shop_info: shopData,
                    // Use item_id and shop_id from itemData
                    itemid: itemData.item_id || itemData.itemid,
                    shopid: itemData.shop_id || itemData.shopid,
                    // Use title as name if name not present
                    name: itemData.name || itemData.title || ""
                }

                console.log("[OK] ======== PDP DATA RECEIVED ========")
                console.log("[DATA] Product:", data.name?.substring(0, 50))
                console.log("💰 Price:", data.price_min / 100000, "-", data.price_max / 100000)
                console.log("[SALES] Historical Sold:", data.historical_sold)
                console.log("[RATING] Rating:", data.rating_star)
                console.log("[VARIANT] Variants:", data.models?.length || 0)
                console.log("[SHOP] Shop:", data.shop_info?.username)

                sendResponse({ success: true, data: data })
            })
            .catch(error => {
                console.error("[ERROR] ======== API FETCH FAILED ========")
                console.error("Error:", error)
                sendResponse({ success: false, error: error.message })
            })

        return true // Keep sendResponse alive for async
    }

    return true
})

console.log("🔧 DataToko Background - Passive Product Capture Ready")
