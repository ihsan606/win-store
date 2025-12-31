import type { PlasmoCSConfig, PlasmoGetInlineAnchor } from "plasmo"
import { useEffect, useState, useCallback } from "react"
import { StoreStatBar } from "~components/StoreStatBar"
import { StoreAnalysisModal } from "~components/StoreAnalysisModal"
import { LoadingOverlay } from "~components/LoadingOverlay"
import { formatCurrencyCompact } from "~utils/shopee-api"

import cssText from "data-text:~/contents/shopee-overlay.css"

export const config: PlasmoCSConfig = {
    matches: ["https://shopee.co.id/*"],
    run_at: "document_end"
}

export const getStyle = () => {
    const style = document.createElement("style")
    style.textContent = cssText
    return style
}

export const getShadowHostId = () => "win-store-overlay"

export const getInlineAnchor: PlasmoGetInlineAnchor = async () => {
    const selectors = [
        ".section-seller-overview-horizontal",
        ".shop-page__seller-overview",
        "[class*='seller-overview']",
        ".shopee-shop-header"
    ]

    while (true) {
        for (const selector of selectors) {
            const el = document.querySelector(selector)
            if (el) return el
        }
        await new Promise(r => setTimeout(r, 500))
    }
}

// Get shop slug from URL (e.g., "samsung.official" from "/samsung.official")
const getShopSlug = () => {
    const path = window.location.pathname
    const segment = path.split("/")[1]
    return segment || ""
}

const isStorePage = () => {
    const path = window.location.pathname
    if (path.startsWith("/product") || path.startsWith("/cart") || path.startsWith("/verify")) return false
    const firstSegment = path.split("/")[1]
    if (!firstSegment) return false
    const knownRoutes = ["search", "daily_discover", "mall", "flash_sale", "cart", "checkout", "user", "buyer"]
    return !knownRoutes.includes(firstSegment)
}

// Format Unix timestamp to Indonesian date
const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

// Format large numbers
const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}JT`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}RB`
    return num.toString()
}

// Storage constants
const STORE_STORAGE_KEY = 'datatoko_store_history'
const RETENTION_DAYS = 7
const MAX_PRODUCTS_PER_STORE = 500
const MAX_STORES = 5
const MAX_TOTAL_PRODUCTS = 2500

// Storage data structure
interface StoredStoreData {
    shopSlug: string
    storeInfo: any
    products: ProductData[]
    updatedAt: number
}

interface StoreHistoryStorage {
    stores: StoredStoreData[]
    lastCleanup: number
}

// Calculate total products in storage
const getTotalStoreProducts = (stores: StoredStoreData[]): number => {
    return stores.reduce((sum, s) => sum + s.products.length, 0)
}

// Legacy localStorage keys (for pagination state only)
const STORAGE_KEYS = {
    pagination: 'datatoko_pagination_state'
}

// Save store data to chrome.storage.local
const saveStoreToStorage = async (shopSlug: string, storeInfo: any, products: ProductData[]) => {
    try {
        const result = await chrome.storage.local.get(STORE_STORAGE_KEY)
        const storage: StoreHistoryStorage = result[STORE_STORAGE_KEY] || { stores: [], lastCleanup: 0 }

        // Find existing entry for this store
        const existingIndex = storage.stores.findIndex(s => s.shopSlug === shopSlug)

        // Prepare data (limit products per store)
        const dataToSave: StoredStoreData = {
            shopSlug,
            storeInfo,
            products: products.slice(0, MAX_PRODUCTS_PER_STORE),
            updatedAt: Date.now()
        }

        if (existingIndex >= 0) {
            storage.stores[existingIndex] = dataToSave
        } else {
            storage.stores.push(dataToSave)
        }

        // Sort by updatedAt (newest first)
        storage.stores.sort((a, b) => b.updatedAt - a.updatedAt)

        // Enforce MAX_STORES limit
        while (storage.stores.length > MAX_STORES) {
            storage.stores.pop()
        }

        // Enforce MAX_TOTAL_PRODUCTS limit
        while (getTotalStoreProducts(storage.stores) > MAX_TOTAL_PRODUCTS && storage.stores.length > 0) {
            const sorted = [...storage.stores].sort((a, b) => b.products.length - a.products.length)
            const largest = sorted[0]
            const idx = storage.stores.findIndex(s => s.shopSlug === largest.shopSlug)
            if (idx >= 0) {
                if (storage.stores[idx].products.length > 100) {
                    storage.stores[idx].products = storage.stores[idx].products.slice(0, storage.stores[idx].products.length - 100)
                } else {
                    storage.stores.splice(idx, 1)
                }
            }
        }

        // Run cleanup if needed (once per day)
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000)
        if (storage.lastCleanup < oneDayAgo) {
            const retentionCutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000)
            storage.stores = storage.stores.filter(s => s.updatedAt > retentionCutoff)
            storage.lastCleanup = Date.now()
        }

        await chrome.storage.local.set({ [STORE_STORAGE_KEY]: storage })
        console.log(`💾 Saved ${products.length} products to chrome.storage`)
    } catch (e) {
        console.error('[DataToko] Failed to save store data:', e)
    }
}

// Load store data from chrome.storage.local
const loadStoreFromStorage = async (shopSlug: string): Promise<{ storeInfo: any, products: ProductData[] } | null> => {
    try {
        const result = await chrome.storage.local.get(STORE_STORAGE_KEY)
        const storage: StoreHistoryStorage = result[STORE_STORAGE_KEY] || { stores: [], lastCleanup: 0 }

        const entry = storage.stores.find(s => s.shopSlug === shopSlug)
        if (entry) {
            const retentionCutoff = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000)
            if (entry.updatedAt > retentionCutoff) {
                console.log(`📂 Loaded ${entry.products.length} products from chrome.storage`)
                return { storeInfo: entry.storeInfo, products: entry.products }
            }
        }
        return null
    } catch (e) {
        console.error('[DataToko] Failed to load store data:', e)
        return null
    }
}


// Merge new products with existing (using itemid as unique key)
const mergeProducts = (existing: ProductData[], newProducts: ProductData[]): ProductData[] => {
    const productMap = new Map<number, ProductData>()

    // Add existing products
    existing.forEach(p => productMap.set(p.itemid, p))

    // Add/update with new products
    let newCount = 0
    newProducts.forEach(p => {
        if (!productMap.has(p.itemid)) newCount++
        productMap.set(p.itemid, p)
    })

    console.log(`🔄 Merged: ${newCount} new products added. Total: ${productMap.size}`)
    return Array.from(productMap.values())
}

export interface ProductData {
    itemid: number
    shopid: number
    name: string
    price: number
    original_price: number
    discount: number
    historical_sold: number
    historical_sold_text: string
    monthly_sold: number
    monthly_sold_text: string
    stock: number
    rating_star: number
    rating_count: number
    liked_count: number
    comment_count: number
    image: string
    ctime: number
    catid: number
    brand: string
}

const ShopeeStoreOverlay = () => {
    const [showOverlay, setShowOverlay] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [products, setProducts] = useState<ProductData[]>([])
    const [isScrolling, setIsScrolling] = useState(false)
    const [scrollIntervalId, setScrollIntervalId] = useState<NodeJS.Timeout | null>(null)
    const [showLoading, setShowLoading] = useState(false)
    const [currentPage, setCurrentPage] = useState(0)
    const [isComplete, setIsComplete] = useState(false)
    const [showPauseConfirm, setShowPauseConfirm] = useState(false)
    const [isStorageLoaded, setIsStorageLoaded] = useState(false)
    const shopSlug = getShopSlug()

    const [stats, setStats] = useState({
        shopName: "-",
        shopId: 0,
        products: "-",
        joined: "-",
        joinedAgo: "-",
        followerCount: "-",
        followingCount: "-",
        rating: 0,
        ratingGood: 0,
        ratingNormal: 0,
        ratingBad: 0,
        totalRatings: 0,
        responseRate: 0,
        responseTime: 0,
        isOfficialShop: false,
        isPreferredPlus: false,
        isVerified: false,
        isVacation: false,
        lastActiveTime: "-",
        totalSold: "-",
        revenue: 0,
        avgRevenue: 0,
        description: "",
        ctimeRaw: 0,
        capturedProducts: 0,
        totalExpected: 0
    })

    // Calculate and update stats from products
    const updateStatsFromProducts = useCallback((productsList: ProductData[]) => {
        let totalSold = 0
        let totalRev = 0

        productsList.forEach((product) => {
            const sold = product.historical_sold || 0
            totalSold += sold
            totalRev += sold * product.price
        })

        setStats(prev => {
            const ctime = prev.ctimeRaw || 0
            const monthsActive = ctime ? Math.max(1, Math.floor((Date.now() / 1000 - ctime) / (30 * 24 * 60 * 60))) : 12

            return {
                ...prev,
                capturedProducts: productsList.length,
                totalSold: formatNumber(totalSold),
                revenue: totalRev,
                avgRevenue: totalRev / monthsActive
            }
        })
    }, [])

    // Auto-save to chrome.storage when products change (debounced)
    useEffect(() => {
        if (!isStorageLoaded || products.length === 0) return

        // Debounce save to avoid too many writes
        const saveTimeout = setTimeout(() => {
            saveStoreToStorage(shopSlug, stats, products)
        }, 1000) // Wait 1 second after last change before saving

        return () => clearTimeout(saveTimeout)
    }, [products, stats, shopSlug, isStorageLoaded])

    // Process incoming products - merge with existing
    const processProductsData = useCallback((newProductsList: ProductData[]) => {
        if (!newProductsList || newProductsList.length === 0) return

        console.log("[DATA] Received products from background:", newProductsList.length, "items")

        // Log detail produk yang diterima
        console.group(`📋 Detail ${newProductsList.length} produk yang diterima:`)
        newProductsList.forEach((p, i) => {
            console.log(`  [${i + 1}] ID: ${p.itemid} | Terjual: ${p.historical_sold_text || p.historical_sold || 'N/A'} | Harga: Rp${p.price?.toLocaleString('id-ID') || 0} | ${p.name?.substring(0, 40)}...`)
        })
        console.groupEnd()

        // Merge with existing products
        setProducts(prev => {
            const merged = mergeProducts(prev, newProductsList)
            // Update stats (save will happen in useEffect)
            updateStatsFromProducts(merged)
            return merged
        })
    }, [shopSlug, updateStatsFromProducts])

    // Main effect - setup listeners and load data
    useEffect(() => {
        if (!isStorePage()) return

        // Load existing data from chrome.storage first
        const loadExistingData = async () => {
            const cached = await loadStoreFromStorage(shopSlug)
            if (cached) {
                setProducts(cached.products)
                updateStatsFromProducts(cached.products)
                if (cached.storeInfo) {
                    setStats(prev => ({ ...prev, ...cached.storeInfo }))
                }
            }
            setIsStorageLoaded(true) // Enable auto-save after loading
        }
        loadExistingData()

        const processShopData = (shopInfo: any) => {
            if (!shopInfo) return

            console.log("[SHOP] Processing shop:", shopInfo.name)

            const joinDate = new Date((shopInfo.ctime || 0) * 1000)
            const diffTime = Math.abs(Date.now() - joinDate.getTime())
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
            const diffYears = Math.floor(diffDays / 365)
            const diffMonths = Math.floor(diffDays / 30)

            let joinedAgo = ""
            if (diffYears > 0) {
                joinedAgo = `${diffYears} Tahun Lalu`
            } else if (diffMonths > 0) {
                joinedAgo = `${diffMonths} Bulan Lalu`
            } else {
                joinedAgo = `${diffDays} Hari Lalu`
            }

            const rg = shopInfo.shop_rating?.rating_good || 0
            const rn = shopInfo.shop_rating?.rating_normal || 0
            const rb = shopInfo.shop_rating?.rating_bad || 0
            const totalRatings = rg + rn + rb

            const newStoreInfo = {
                shopName: shopInfo.name || "-",
                shopId: shopInfo.shopid || 0,
                products: formatNumber(shopInfo.item_count || 0),
                joined: formatDate(shopInfo.ctime || 0),
                joinedAgo: joinedAgo,
                followerCount: formatNumber(shopInfo.follower_count || 0),
                followingCount: formatNumber(shopInfo.account?.following_count || 0),
                rating: shopInfo.rating_star || 0,
                ratingGood: rg,
                ratingNormal: rn,
                ratingBad: rb,
                totalRatings: totalRatings,
                responseRate: shopInfo.response_rate || 0,
                responseTime: shopInfo.response_time || 0,
                isOfficialShop: shopInfo.show_official_shop_label || false,
                isPreferredPlus: shopInfo.is_preferred_plus_seller || false,
                isVerified: shopInfo.is_shopee_verified || false,
                isVacation: shopInfo.vacation || false,
                lastActiveTime: shopInfo.last_active_time ? formatDate(shopInfo.last_active_time) : "-",
                description: shopInfo.description || "",
                ctimeRaw: shopInfo.ctime || 0,
                totalExpected: shopInfo.item_count || 0
            }

            // Save to chrome.storage (will be saved together with products)

            setStats(prev => ({
                ...prev,
                ...newStoreInfo
            }))
        }

        // Listen for data from background script
        const messageListener = (message: any) => {
            if (message.type === "SHOPEE_DATA_UPDATE") {
                console.log("📨 Data update from background:", message.data?.totalProducts)

                if (message.data?.shopInfo) {
                    processShopData(message.data.shopInfo)
                }
                if (message.data?.products) {
                    processProductsData(message.data.products)
                }
                if (message.data?.totalExpected) {
                    setStats(prev => ({ ...prev, totalExpected: message.data.totalExpected }))
                }
            }
        }

        chrome.runtime.onMessage.addListener(messageListener)

        // Request any already-captured data from background
        const requestData = () => {
            chrome.runtime.sendMessage({ type: "GET_CAPTURED_DATA" }, (response) => {
                if (chrome.runtime.lastError) return
                if (response?.data) {
                    console.log("📨 Got data from background, products:", response.data.totalProducts)
                    if (response.data.shopInfo) processShopData(response.data.shopInfo)
                    if (response.data.products) processProductsData(response.data.products)
                }
            })
        }

        // Request data aggressively on initial load (multiple early requests)
        // This helps catch data even if debugger attached late
        setTimeout(requestData, 300)
        setTimeout(requestData, 800)
        setTimeout(requestData, 1500)
        setTimeout(requestData, 3000)

        // Auto-refresh if store data not captured after 5 seconds
        // This handles cases where debugger attached too late
        const autoRefreshTimeout = setTimeout(() => {
            setStats(currentStats => {
                // Check if we have store data (shopName should not be "-")
                if (currentStats.shopName === "-") {
                    console.log("⚠️ Store data not captured, auto-refreshing...")
                    window.location.reload()
                }
                return currentStats
            })
        }, 5000)

        // Then continue polling less frequently
        const interval = setInterval(requestData, 3000)

        setShowOverlay(true)

        // Check if we should resume auto-pagination
        checkAndResumeAutoPagination()

        return () => {
            chrome.runtime.onMessage.removeListener(messageListener)
            clearInterval(interval)
            clearTimeout(autoRefreshTimeout)
        }

    }, [shopSlug, processProductsData, updateStatsFromProducts])

    // Check and resume auto-pagination after page reload
    const checkAndResumeAutoPagination = () => {
        try {
            const savedState = localStorage.getItem(STORAGE_KEYS.pagination)
            if (!savedState) return

            const state = JSON.parse(savedState)

            // Check if this is the right shop and state is still valid (within 5 minutes)
            if (state.shopSlug === shopSlug &&
                state.active &&
                (Date.now() - state.startTime < 300000) &&
                window.location.hash.includes('product_list')) {

                console.log("[INFO] Resuming auto-pagination after reload...")
                // Wait for page to fully load
                setTimeout(() => {
                    startPagination()
                }, 3000)
            } else {
                localStorage.removeItem(STORAGE_KEYS.pagination)
            }
        } catch (e) {
            localStorage.removeItem(STORAGE_KEYS.pagination)
        }
    }

    // Start the pagination process
    const startPagination = (resumeFromPage = 0) => {
        console.log("▶️ Starting pagination..." + (resumeFromPage > 0 ? ` (resuming from page ${resumeFromPage})` : ""))
        console.log("[DEBUG] Initial products count:", stats.capturedProducts)
        setIsScrolling(true)
        setShowLoading(true)
        setIsComplete(false)
        setShowPauseConfirm(false)

        if (resumeFromPage === 0) {
            setCurrentPage(0)
        }

        let pageCount = resumeFromPage
        const maxPages = 50
        const pauseAtPage = 20
        let intervalId: NodeJS.Timeout | null = null

        const clickNextPage = () => {
            // Get current product count from stats (captured products from background)
            const currentProductCount = stats.capturedProducts || 0
            console.log(`📄 Page ${pageCount} | Captured Products: ${currentProductCount}`)

            // Check if we need to pause at page 20
            if (pageCount > 0 && pageCount % pauseAtPage === 0 && pageCount < maxPages) {
                console.log(`⏸️ Pausing at page ${pageCount} for confirmation...`)
                if (intervalId) clearInterval(intervalId)
                setScrollIntervalId(null)
                setIsScrolling(false)
                setShowPauseConfirm(true)
                return
            }

            // Find and click the Next button
            const nextButtonSelectors = [
                'button.shopee-mini-page-controller__next-btn',
                '.shopee-mini-page-controller__next-btn',
                'button.shopee-button-outline.shopee-mini-page-controller__next-btn'
            ]

            let nextButton: HTMLButtonElement | null = null
            for (const selector of nextButtonSelectors) {
                const el = document.querySelector(selector) as HTMLButtonElement
                if (el) {
                    console.log(`  🔍 Found button: ${selector}, disabled: ${el.disabled}`)
                    if (!el.disabled) {
                        nextButton = el
                        break
                    }
                }
            }

            if (nextButton) {
                pageCount++
                setCurrentPage(pageCount)
                console.log(`\n${'='.repeat(60)}`)
                console.log(`🔄 KLIK PAGE ${pageCount}`)
                console.log(`${'='.repeat(60)}`)
                console.log(`⏰ Waktu: ${new Date().toLocaleTimeString('id-ID')}`)
                console.log(`📊 Total produk sebelum klik: ${stats.capturedProducts}`)
                nextButton.click()

                // Also try to scroll to load products
                const productGrid = document.querySelector('.shop-search-result-view') ||
                    document.querySelector('[class*="shop-search"]') ||
                    document.querySelector('.shop-page__all-products')
                if (productGrid) {
                    productGrid.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
            } else {
                // No more pages or button not found/disabled
                console.log("[OK] No more pages - pagination complete!")
                console.log(`📊 Final captured products: ${stats.capturedProducts}`)
                if (intervalId) clearInterval(intervalId)
                setScrollIntervalId(null)
                setIsScrolling(false)
                setIsComplete(true)
                localStorage.removeItem(STORAGE_KEYS.pagination)
                return
            }

            // Check limits
            if (pageCount >= maxPages) {
                console.log("⚠️ Max page limit reached")
                console.log(`📊 Final captured products: ${stats.capturedProducts}`)
                if (intervalId) clearInterval(intervalId)
                setScrollIntervalId(null)
                setIsScrolling(false)
                setIsComplete(true)
                localStorage.removeItem(STORAGE_KEYS.pagination)
            }
        }

        // Wait for page to load, then start clicking
        // Using 5s interval to ensure API data is fully captured before next page
        setTimeout(() => {
            console.log("🚀 Starting pagination interval (5s per page)")
            intervalId = setInterval(clickNextPage, 5000)
            setScrollIntervalId(intervalId)
        }, 3000)
    }

    // Continue pagination after pause confirmation
    const handleContinuePagination = () => {
        console.log("▶️ Continuing pagination from page", currentPage)
        setShowPauseConfirm(false)
        startPagination(currentPage)
    }

    // Handle Load All button click
    const handleLoadAll = () => {
        if (isScrolling) {
            // Stop pagination
            if (scrollIntervalId) {
                clearInterval(scrollIntervalId)
                setScrollIntervalId(null)
            }
            setIsScrolling(false)
            setShowLoading(false)
            setIsComplete(false)
            localStorage.removeItem(STORAGE_KEYS.pagination)
            console.log("⏹️ Pagination stopped")
        } else {
            // Check if we need to navigate to #product_list first
            if (!window.location.hash.includes('product_list')) {
                console.log("[NAV] Navigating to #product_list...")

                // Save state for resume after reload
                localStorage.setItem(STORAGE_KEYS.pagination, JSON.stringify({
                    active: true,
                    shopSlug: shopSlug,
                    startTime: Date.now()
                }))

                // Navigate to clean URL with #product_list and reload
                const cleanUrl = window.location.origin + '/' + shopSlug + '#product_list'
                window.location.href = cleanUrl
                return
            }

            // Already on product_list, start pagination directly
            startPagination()
        }
    }

    // Handle stop from loading overlay
    const handleStopLoading = () => {
        if (scrollIntervalId) {
            clearInterval(scrollIntervalId)
            setScrollIntervalId(null)
        }
        setIsScrolling(false)
        setShowLoading(false)
        setIsComplete(false)
        localStorage.removeItem(STORAGE_KEYS.pagination)
        console.log("⏹️ Pagination stopped from overlay")
    }

    // Handle scroll to top - scroll to the overlay stat bar
    const handleScrollToTop = () => {
        console.log("[NAV] Scrolling to top...")

        // The overlay is injected near seller-overview, so scroll to that area
        const targetElements = [
            '.section-seller-overview-horizontal',
            '.shop-page__seller-overview',
            '[class*="seller-overview"]',
            '.shopee-shop-header'
        ]

        for (const selector of targetElements) {
            const el = document.querySelector(selector)
            if (el) {
                console.log("[NAV] Found element:", selector)
                el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                return
            }
        }

        // Fallback - just scroll to page top
        console.log("[NAV] Fallback: scrolling to page top")
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    // Clear products data for this shop
    const handleClearData = async () => {
        // Clear from chrome.storage
        try {
            const result = await chrome.storage.local.get(STORE_STORAGE_KEY)
            const storage: StoreHistoryStorage = result[STORE_STORAGE_KEY] || { stores: [], lastCleanup: 0 }
            storage.stores = storage.stores.filter(s => s.shopSlug !== shopSlug)
            await chrome.storage.local.set({ [STORE_STORAGE_KEY]: storage })
        } catch (e) {
            console.error('Failed to clear store data:', e)
        }
        setProducts([])
        setStats(prev => ({ ...prev, capturedProducts: 0, totalSold: "-", revenue: 0, avgRevenue: 0 }))
        console.log("🗑️ Cleared products data")
    }

    if (!showOverlay) return null

    return (
        <div style={{
            width: "100%",
            padding: "8px 0",
            boxSizing: "border-box"
        }}>
            <StoreStatBar
                stats={{
                    ...stats,
                    revenue: formatCurrencyCompact(stats.revenue),
                    revenueRaw: stats.revenue,
                    avgRevenue: formatCurrencyCompact(stats.avgRevenue),
                    avgRevenueRaw: stats.avgRevenue,
                    isScrolling: isScrolling
                }}
                onAnalyze={() => setShowModal(true)}
                onLoadAll={handleLoadAll}
            />
            {showModal && (
                <StoreAnalysisModal
                    products={products}
                    shopName={stats.shopName}
                    onClose={() => setShowModal(false)}
                />
            )}
            <LoadingOverlay
                isVisible={showLoading || showPauseConfirm}
                currentPage={currentPage}
                capturedProducts={stats.capturedProducts || products.length}
                totalExpected={stats.totalExpected}
                isComplete={isComplete}
                isPaused={showPauseConfirm}
                onScrollToTop={handleScrollToTop}
                onClose={() => { setShowLoading(false); setShowPauseConfirm(false) }}
                onStop={handleStopLoading}
                onContinue={handleContinuePagination}
            />
        </div>
    )
}

export default ShopeeStoreOverlay
