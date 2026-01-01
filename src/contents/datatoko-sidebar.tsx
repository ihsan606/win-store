import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState, useRef, useCallback } from "react"
import cssText from "data-text:~/contents/sidebar.css"
import iconUrl from "data-base64:~/assets/icon.png"

export const config: PlasmoCSConfig = {
    matches: ["https://shopee.co.id/*"],
    run_at: "document_end"
}

export const getStyle = () => {
    const style = document.createElement("style")
    style.textContent = cssText
    return style
}

export const getShadowHostId = () => "datatoko-sidebar"

// Check page type
const getPageType = () => {
    const path = window.location.pathname
    // Format: /{product-name}-i.{shop_id}.{item_id}
    if (/-i\.\d+\.\d+/.test(path)) return 'product'
    // Format: /product/{shop_id}/{item_id}
    if (/^\/product\/\d+\/\d+/.test(path)) return 'product'

    const firstSegment = path.split("/")[1]
    if (!firstSegment) return 'home'

    const knownRoutes = ["search", "daily_discover", "mall", "flash_sale", "cart", "checkout", "user", "buyer", "product"]
    if (knownRoutes.includes(firstSegment)) return firstSegment

    return 'store'
}

// Sidebar width constant
const SIDEBAR_WIDTH = 380

// Inject/remove body resize style (outside Shadow DOM)
const BODY_RESIZE_STYLE_ID = 'datatoko-body-resize'

const injectBodyResizeStyle = () => {
    // Check if style already exists
    if (document.getElementById(BODY_RESIZE_STYLE_ID)) return

    const style = document.createElement('style')
    style.id = BODY_RESIZE_STYLE_ID
    style.textContent = `
        /* DataToko Sidebar - Body Resize */
        html {
            margin-right: ${SIDEBAR_WIDTH}px !important;
            transition: margin-right 0.3s ease !important;
        }
        body {
            min-width: auto !important;
            overflow-x: hidden !important;
        }
        /* Fix for fixed positioned elements */
        .shopee-popup,
        .shopee-drawer,
        [class*="popup"],
        [class*="modal"],
        [class*="drawer"] {
            max-width: calc(100vw - ${SIDEBAR_WIDTH}px) !important;
        }
    `
    document.head.appendChild(style)
    console.log('📐 Body resize style injected')
}

const removeBodyResizeStyle = () => {
    const style = document.getElementById(BODY_RESIZE_STYLE_ID)
    if (style) {
        style.remove()
        console.log('📐 Body resize style removed')
    }
}

// Format currency
const formatCurrency = (num: number) => {
    if (num >= 1000000000) return `Rp ${(num / 1000000000).toFixed(1)}M`
    if (num >= 1000000) return `Rp ${(num / 1000000).toFixed(0)}JT`
    if (num >= 1000) return `Rp ${(num / 1000).toFixed(0)}RB`
    return `Rp ${num.toLocaleString('id-ID')}`
}

// Format number
const formatNumber = (num: number) => {
    return num.toLocaleString('id-ID')
}

// Format price (full, not abbreviated)
const formatPrice = (price: number) => {
    if (!price) return "Rp 0"
    return `Rp ${price.toLocaleString("id-ID")}`
}

// Tooltip component for metrics - appears above the label
// align='left' = tooltip extends to the right (for elements on left side)
// align='right' = tooltip extends to the left (for elements on right side)
const Tooltip = ({ children, text, align = 'left' }: { children: React.ReactNode; text: string; align?: 'left' | 'right' }) => {
    const [show, setShow] = useState(false)
    return (
        <span
            style={{ position: 'relative', cursor: 'help' }}
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
        >
            {children}
            {show && (
                <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    ...(align === 'left'
                        ? { left: '0' }  // Tooltip extends to the right
                        : { right: '0' } // Tooltip extends to the left
                    ),
                    padding: '10px 12px',
                    background: '#1f2937',
                    color: '#fff',
                    fontSize: '11px',
                    borderRadius: '6px',
                    whiteSpace: 'normal',
                    width: '240px',
                    zIndex: 10000,
                    lineHeight: '1.5',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                    textAlign: 'left'
                }}>
                    {text}
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        ...(align === 'left'
                            ? { left: '12px' }
                            : { right: '12px' }
                        ),
                        border: '6px solid transparent',
                        borderTopColor: '#1f2937'
                    }} />
                </div>
            )}
        </span>
    )
}

// Stat row with tooltip
const StatRow = ({ label, value, tooltip, highlight }: {
    label: string
    value: React.ReactNode
    tooltip: string
    highlight?: boolean
}) => (
    <div className="datatoko-stat-row">
        <Tooltip text={tooltip}>
            <span className="datatoko-stat-label" style={{ borderBottom: '1px dotted #9ca3af' }}>{label}</span>
        </Tooltip>
        <span className={`datatoko-stat-value ${highlight ? 'highlight' : ''}`}>{value}</span>
    </div>
)

// Variant info
interface VariantInfo {
    modelid: number
    name: string
    price: number
    priceBeforeDiscount: number
    stock: number
    sold: number
}

// Bookmarked product for storage
interface BookmarkedProduct {
    itemid: number
    shopid: number
    name: string
    image: string
    priceMin: number
    priceMax: number
    historicalSold: number
    monthlySold: number
    monthlyRevenue: number
    rating: number
    ratingCount: number
    variants: VariantInfo[]
    selectedVariantId?: number
    selectedVariantName?: string
    shopName: string
    isOfficialShop: boolean
    bookmarkedAt: number
    url: string
}

interface ProductStats {
    // Basic info
    itemid: number
    shopid: number
    name: string
    image: string

    // Timestamps
    addedDate: string
    ctimeRaw: number
    monthsActive: number
    daysActive: number

    // Stock
    stock: number
    inventoryDays: number // stock / daily_sold

    // Price
    price: number
    priceMin: number
    priceMax: number
    priceBeforeDiscount: number
    discount: number
    priceSpread: number // percentage spread between min/max

    // Sales
    historicalSold: number
    monthlySold: number
    dailySold: number
    monthlyRevenue: number
    totalRevenue: number

    // Rating & Distribution
    rating: number
    ratingCount: number
    ratingDistribution: number[] // [total, 1★, 2★, 3★, 4★, 5★]
    rating5Pct: number
    rating4Pct: number
    ratingBadPct: number // 1-3 stars

    // Engagement
    commentCount: number
    likes: number
    viewCount: number
    reviewRate: number // comments / sold * 100
    likeRate: number // likes / sold * 100

    // Variants
    variants: VariantInfo[]
    bestVariant: VariantInfo | null
    variantCount: number

    // Shop info
    shopName: string
    shopUsername: string
    isOfficialShop: boolean
    isPreferredPlus: boolean
    isVerified: boolean
    shopLocation: string

    // Raw data for bookmarking
    rawData: any
}

const DataTokoSidebar = () => {
    const [isOpen, setIsOpen] = useState(false)
    const [pageType, setPageType] = useState<string>('unknown')
    const [productStats, setProductStats] = useState<ProductStats | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isDragging, setIsDragging] = useState(false)
    const [dragDirection, setDragDirection] = useState<'up' | 'down' | null>(null)  // For stretchy effect
    const [fabPosition, setFabPosition] = useState(() => {
        const saved = localStorage.getItem('datatoko_fab_position')
        return saved ? parseInt(saved) : 50 // percentage from top
    })
    const [isHovering, setIsHovering] = useState(false)
    const [currentUrl, setCurrentUrl] = useState(window.location.href)

    // Bookmark states
    const [showBookmarkModal, setShowBookmarkModal] = useState(false)
    const [bookmarks, setBookmarks] = useState<BookmarkedProduct[]>([])
    const [selectedVariantId, setSelectedVariantId] = useState<string | number>("") // variant ID or empty string roughly maps to "all"

    // Load bookmarks from localStorage
    const loadBookmarks = useCallback(() => {
        const saved = localStorage.getItem('datatoko_bookmarks')
        if (saved) {
            setBookmarks(JSON.parse(saved))
        }
    }, [])

    // Load bookmarks on mount
    useEffect(() => {
        loadBookmarks()
    }, [loadBookmarks])

    // Remove bookmark
    const removeBookmark = (itemid: number) => {
        const updated = bookmarks.filter(b => b.itemid !== itemid)
        setBookmarks(updated)
        localStorage.setItem('datatoko_bookmarks', JSON.stringify(updated))
    }

    // Export to CSV
    const exportToCSV = () => {
        if (bookmarks.length === 0) return

        const headers = ['Nama Produk', 'Harga Min', 'Harga Max', 'Total Terjual', 'Terjual/Bulan', 'Omset/Bulan', 'Rating', 'Ulasan', 'Toko', 'Official', 'Varian Terlaris', 'URL']
        const rows = bookmarks.map(b => {
            const bestVariant = b.variants.sort((a, v) => v.sold - a.sold)[0]
            return [
                `"${b.name.replace(/"/g, '""')}"`,
                b.priceMin,
                b.priceMax,
                b.historicalSold,
                b.monthlySold,
                Math.round(b.monthlyRevenue),
                b.rating.toFixed(1),
                b.ratingCount,
                `"${b.shopName}"`,
                b.isOfficialShop ? 'Ya' : 'Tidak',
                bestVariant ? `"${bestVariant.name} (${bestVariant.sold})"` : '-',
                b.url
            ].join(',')
        })

        const csv = [headers.join(','), ...rows].join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `datatoko-bookmarks-${new Date().toISOString().split('T')[0]}.csv`
        link.click()
        URL.revokeObjectURL(url)
    }

    // Export to JSON
    const exportToJSON = () => {
        if (bookmarks.length === 0) return

        const json = JSON.stringify(bookmarks, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `datatoko-bookmarks-${new Date().toISOString().split('T')[0]}.json`
        link.click()
        URL.revokeObjectURL(url)
    }

    const fabRef = useRef<HTMLDivElement>(null)
    const dragStartY = useRef(0)
    const dragStartPos = useRef(0)

    // Format date from timestamp
    const formatDateFromTimestamp = (timestamp: number) => {
        if (!timestamp) return "N/A"
        const date = new Date(timestamp * 1000)
        const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
        return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
    }

    // Calculate months since product was added
    const getMonthsActive = (ctime: number) => {
        if (!ctime) return 1
        const now = Date.now() / 1000
        return Math.max(1, Math.floor((now - ctime) / (30 * 24 * 60 * 60)))
    }

    // Parse product URL to extract shop_id and item_id
    const parseProductUrl = (url: string): { shopId: string, itemId: string } | null => {
        // Format 1: https://shopee.co.id/{product-name}-i.{shop_id}.{item_id}
        const match1 = url.match(/i\.(\d+)\.(\d+)/)
        if (match1) {
            return { shopId: match1[1], itemId: match1[2] }
        }

        // Format 2: https://shopee.co.id/product/{shop_id}/{item_id}
        const match2 = url.match(/\/product\/(\d+)\/(\d+)/)
        if (match2) {
            return { shopId: match2[1], itemId: match2[2] }
        }

        return null
    }

    // Fetch PDP data via background script (to bypass CORS)
    const fetchPDPData = useCallback(async () => {
        const productIds = parseProductUrl(window.location.href)
        if (!productIds) {
            console.log("[ERROR] Could not parse product URL:", window.location.href)
            setIsLoading(false)
            return
        }

        console.log("[INFO] ======== REQUESTING PDP DATA ========")
        console.log("[NAV] URL:", window.location.href)
        console.log("[SHOP] Shop ID:", productIds.shopId)
        console.log("[DATA] Item ID:", productIds.itemId)

        try {
            // Send message to background script to fetch
            const response = await chrome.runtime.sendMessage({
                type: "FETCH_PDP",
                shopId: productIds.shopId,
                itemId: productIds.itemId
            })

            console.log("[API] Response from background:", response)

            if (response?.success && response.data) {
                console.log("[OK] ======== PDP DATA RECEIVED ========")
                console.log("[DATA] Product:", response.data.name?.substring(0, 50))
                processProductData(response.data)
            } else {
                console.error("[ERROR] Failed to get PDP data:", response?.error)
                setIsLoading(false)
            }
        } catch (error) {
            console.error("[ERROR] Error sending message:", error)
            setIsLoading(false)
        }
    }, [])

    // Process product data and set stats
    const processProductData = (data: any) => {
        const monthsActive = getMonthsActive(data.ctime)
        const daysActive = Math.max(1, Math.floor((Date.now() / 1000 - data.ctime) / (24 * 60 * 60)))

        // Sales calculations
        const historicalSold = data.historical_sold || 0
        const monthlySold = historicalSold > 0 ? Math.round(historicalSold / monthsActive) : 0
        const dailySold = historicalSold > 0 ? Math.round(historicalSold / daysActive) : 0
        const avgPrice = (data.price_min + data.price_max) / 2 || data.price || 0

        // Stock calculations
        const stock = data.stock || data.normal_stock || 0
        const inventoryDays = dailySold > 0 ? Math.round(stock / dailySold) : 999

        // Price spread
        const priceSpread = data.price_min > 0
            ? Math.round((data.price_max - data.price_min) / data.price_min * 100)
            : 0

        // Rating distribution [total, 1★, 2★, 3★, 4★, 5★]
        const ratingDist = Array.isArray(data.rating_count) ? data.rating_count : [0, 0, 0, 0, 0, 0]
        const totalRatings = ratingDist[0] || 1
        const rating5Pct = Math.round(ratingDist[5] / totalRatings * 100)
        const rating4Pct = Math.round(ratingDist[4] / totalRatings * 100)
        const ratingBadPct = Math.round((ratingDist[1] + ratingDist[2] + ratingDist[3]) / totalRatings * 100)

        // Engagement rates
        const reviewRate = historicalSold > 0 ? Math.round(data.cmt_count / historicalSold * 100) : 0
        const likeRate = historicalSold > 0 ? Math.round(data.liked_count / historicalSold * 100) : 0

        // Variants
        const variants: VariantInfo[] = (data.models || []).map((m: any) => ({
            modelid: m.modelid || m.model_id,
            name: m.name,
            price: m.price ? m.price / 100000 : 0,
            priceBeforeDiscount: m.price_before_discount ? m.price_before_discount / 100000 : 0,
            stock: m.stock || m.normal_stock || 0,
            sold: m.sold || 0
        }))
        const sortedVariants = [...variants].sort((a, b) => b.sold - a.sold)
        const bestVariant = sortedVariants.length > 0 ? sortedVariants[0] : null

        setProductStats({
            itemid: data.itemid || data.item_id,
            shopid: data.shopid || data.shop_id,
            name: data.name || data.title || "",
            image: data.image || "",

            addedDate: formatDateFromTimestamp(data.ctime),
            ctimeRaw: data.ctime,
            monthsActive,
            daysActive,

            stock,
            inventoryDays,

            price: data.price ? data.price / 100000 : (data.price_min ? data.price_min / 100000 : 0),
            priceMin: data.price_min ? data.price_min / 100000 : 0,
            priceMax: data.price_max ? data.price_max / 100000 : 0,
            priceBeforeDiscount: data.price_before_discount ? data.price_before_discount / 100000 : 0,
            discount: data.discount || data.raw_discount || 0,
            priceSpread,

            historicalSold,
            monthlySold,
            dailySold,
            monthlyRevenue: monthlySold * avgPrice / 100000,
            totalRevenue: historicalSold * avgPrice / 100000,

            rating: data.rating_star || data.item_rating?.rating_star || 0,
            ratingCount: totalRatings,
            ratingDistribution: ratingDist,
            rating5Pct,
            rating4Pct,
            ratingBadPct,

            commentCount: data.cmt_count || 0,
            likes: data.liked_count || 0,
            viewCount: data.view_count || 0,
            reviewRate,
            likeRate,

            variants,
            bestVariant,
            variantCount: variants.length,

            shopName: data.shop_info?.name || data.shop_info?.username || "-",
            shopUsername: data.shop_info?.username || "",
            isOfficialShop: data.shop_info?.is_official_shop || false,
            isPreferredPlus: data.shop_info?.is_preferred_plus || false,
            isVerified: data.shop_info?.is_shopee_verified || false,
            shopLocation: data.shop_location || "",

            rawData: data
        })
        setIsLoading(false)
        setSelectedVariantId("") // Reset selected variant on new product load
    }

    // Handle page type changes (including SPA navigation)
    const handlePageChange = useCallback(() => {
        const type = getPageType()
        console.log("[NAV] Page type:", type)
        setPageType(type)

        if (type === 'product') {
            setIsOpen(true)
            setIsLoading(true)
            setProductStats(null)
            // Fetch PDP data from local API
            fetchPDPData()
        } else {
            // Close sidebar on non-product pages
            setIsOpen(false)
            setIsLoading(false)
        }
    }, [fetchPDPData])

    // Initial page check and URL change listener for SPA navigation
    useEffect(() => {
        // Initial check
        handlePageChange()

        // Listen for URL changes (SPA navigation)
        let lastUrl = window.location.href
        const urlCheckInterval = setInterval(() => {
            if (window.location.href !== lastUrl) {
                console.log("[INFO] URL changed:", lastUrl, "->", window.location.href)
                lastUrl = window.location.href
                setCurrentUrl(window.location.href)
                handlePageChange()
            }
        }, 500)

        // Also listen for popstate (back/forward navigation)
        const handlePopState = () => {
            console.log("[INFO] Popstate event")
            handlePageChange()
        }
        window.addEventListener('popstate', handlePopState)

        return () => {
            clearInterval(urlCheckInterval)
            window.removeEventListener('popstate', handlePopState)
        }
    }, [handlePageChange])

    // NOTE: SHOPEE_PDP_UPDATE passive capture is DISABLED
    // We're using FETCH_PDP from external API (127.0.0.1:5555) as primary data source
    // Passive capture was overwriting data with incomplete response (historical_sold = 0)
    /*
    useEffect(() => {
        const messageListener = (message: any) => {
            if (message.type === "SHOPEE_PDP_UPDATE" && message.data) {
                const shopeeData = message.data
                console.log("[OK] Received passive PDP data:", shopeeData.name?.substring(0, 50))
                processProductData(shopeeData)
            }
        }
        chrome.runtime.onMessage.addListener(messageListener)
        return () => chrome.runtime.onMessage.removeListener(messageListener)
    }, [])
    */

    // Handle drag start
    const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault()
        setIsDragging(true)
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
        dragStartY.current = clientY
        dragStartPos.current = fabPosition
    }, [fabPosition])

    // Handle drag move
    useEffect(() => {
        if (!isDragging) return

        let lastY = dragStartY.current

        const handleMove = (e: MouseEvent | TouchEvent) => {
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
            const deltaY = clientY - dragStartY.current
            const deltaPercent = (deltaY / window.innerHeight) * 100
            const newPos = Math.min(85, Math.max(10, dragStartPos.current + deltaPercent))

            // Track direction for stretchy effect
            if (clientY < lastY) {
                setDragDirection('up')
            } else if (clientY > lastY) {
                setDragDirection('down')
            }
            lastY = clientY

            setFabPosition(newPos)
        }

        const handleEnd = () => {
            setIsDragging(false)
            // Bounce effect on release - reset direction after short delay
            setTimeout(() => setDragDirection(null), 200)
            localStorage.setItem('datatoko_fab_position', fabPosition.toString())
        }

        document.addEventListener('mousemove', handleMove)
        document.addEventListener('mouseup', handleEnd)
        document.addEventListener('touchmove', handleMove)
        document.addEventListener('touchend', handleEnd)

        return () => {
            document.removeEventListener('mousemove', handleMove)
            document.removeEventListener('mouseup', handleEnd)
            document.removeEventListener('touchmove', handleMove)
            document.removeEventListener('touchend', handleEnd)
        }
    }, [isDragging, fabPosition])

    const toggleSidebar = () => {
        if (!isDragging) {
            const newIsOpen = !isOpen
            setIsOpen(newIsOpen)

            // Inject or remove body resize style
            if (newIsOpen) {
                injectBodyResizeStyle()
            } else {
                removeBodyResizeStyle()
            }
        }
    }

    // Cleanup body resize style on unmount
    useEffect(() => {
        return () => {
            removeBodyResizeStyle()
        }
    }, [])

    // Sync body resize style with isOpen state (for auto-open on product pages)
    useEffect(() => {
        if (isOpen) {
            injectBodyResizeStyle()
        } else {
            removeBodyResizeStyle()
        }
    }, [isOpen])

    // Only show on product pages
    if (pageType !== 'product') {
        return null
    }

    return (
        <>
            {/* Floating Toggle Button with Drag Handle */}
            <div
                ref={fabRef}
                className={`datatoko-fab-container ${isHovering ? 'hovering' : ''} ${isDragging ? 'dragging' : ''} ${isOpen ? 'sidebar-open' : ''}`}
                style={{
                    top: `${fabPosition}%`,
                    transform: dragDirection === 'up'
                        ? 'scaleY(1.3) scaleX(0.85) rotate(8deg)'
                        : dragDirection === 'down'
                            ? 'scaleY(0.75) scaleX(1.15) rotate(-8deg)'
                            : 'scaleY(1) scaleX(1) rotate(0deg)',
                    transition: isDragging ? 'transform 0.1s ease-out' : 'transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55), top 0.2s ease'
                }}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
            >
                {/* Main Button */}
                <button
                    className="datatoko-fab"
                    onClick={toggleSidebar}
                    title="DataToko"
                >
                    <span className="datatoko-fab-icon">
                        <img src={iconUrl} alt="DataToko" />
                    </span>
                </button>

                {/* Drag Handle - on the right */}
                <div
                    className="datatoko-drag-handle"
                    onMouseDown={handleDragStart}
                    onTouchStart={handleDragStart}
                >
                    <span className="datatoko-drag-dots">
                        <span></span><span></span><span></span>
                        <span></span><span></span><span></span>
                    </span>
                </div>
            </div>

            {/* Sidebar Panel - docked, not floating */}
            <div className={`datatoko-sidebar ${isOpen ? 'open' : ''}`}>
                {/* Header */}
                <div className="datatoko-sidebar-header">
                    <div className="datatoko-sidebar-brand">
                        <span className="datatoko-fab-icon">
                            <img src={iconUrl} alt="DataToko" />
                        </span>
                        <span className="datatoko-sidebar-title">DataToko</span>
                    </div>
                    <button className="datatoko-sidebar-close" onClick={toggleSidebar}>
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="datatoko-sidebar-content">
                    {pageType === 'product' && (
                        <>
                            {/* Product Info */}
                            <div className="datatoko-sidebar-section">
                                <div className="datatoko-page-indicator">
                                    <span className="datatoko-page-icon"></span>
                                    <span className="datatoko-page-label">Halaman Produk</span>
                                </div>
                            </div>

                            {isLoading ? (
                                <div className="datatoko-sidebar-loading">
                                    <div className="datatoko-spinner"></div>
                                    <span>Memuat data...</span>
                                </div>
                            ) : productStats && (
                                <>

                                    {/* Overview Card */}
                                    <div className="datatoko-sidebar-section" style={{ background: 'linear-gradient(135deg, #1A352B 0%, #2d5a47 100%)', borderRadius: '8px', margin: '0 8px 12px', padding: '12px' }}>
                                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', marginBottom: '8px' }}>RINGKASAN</div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: 'white' }}>
                                            <Tooltip text="Total unit terjual sejak produk di-listing pertama kali.">
                                                <div>
                                                    <div style={{ fontSize: '10px', opacity: 0.7 }}>Total Terjual</div>
                                                    <div style={{ fontSize: '16px', fontWeight: '700' }}>{formatNumber(productStats.historicalSold)}</div>
                                                </div>
                                            </Tooltip>
                                            <Tooltip text="Estimasi total pendapatan (harga rata-rata × total terjual). Berguna untuk perkiraan potensi produk." align="right">
                                                <div>
                                                    <div style={{ fontSize: '10px', opacity: 0.7 }}>Est. Omset</div>
                                                    <div style={{ fontSize: '16px', fontWeight: '700' }}>{formatCurrency(productStats.totalRevenue)}</div>
                                                </div>
                                            </Tooltip>
                                            <Tooltip text="Rata-rata penjualan per bulan. Formula: total terjual / bulan aktif.">
                                                <div>
                                                    <div style={{ fontSize: '10px', opacity: 0.7 }}>Per Bulan</div>
                                                    <div style={{ fontSize: '14px', fontWeight: '600' }}>{formatNumber(productStats.monthlySold)} pcs</div>
                                                </div>
                                            </Tooltip>
                                            <Tooltip text="Usia produk sejak pertama kali di-listing. Produk baru (<3 bulan) perlu waktu untuk membangun momentum." align="right">
                                                <div>
                                                    <div style={{ fontSize: '10px', opacity: 0.7 }}>Aktif</div>
                                                    <div style={{ fontSize: '14px', fontWeight: '600' }}>{productStats.monthsActive} bulan</div>
                                                </div>
                                            </Tooltip>
                                        </div>
                                    </div>

                                    {/* Harga */}
                                    <div className="datatoko-sidebar-section">
                                        <h4 className="datatoko-section-title">Harga</h4>
                                        <StatRow
                                            label="Range Harga"
                                            value={`${formatCurrency(productStats.priceMin)} - ${formatCurrency(productStats.priceMax)}`}
                                            tooltip="Rentang harga dari varian termurah hingga termahal. Berguna untuk memahami positioning harga produk."
                                            highlight
                                        />
                                        {productStats.priceSpread > 0 && (
                                            <StatRow
                                                label="Price Spread"
                                                value={`${productStats.priceSpread}%`}
                                                tooltip="Selisih persentase antara harga tertinggi dan terendah. Spread tinggi menunjukkan variasi produk yang signifikan (ukuran, spesifikasi)."
                                            />
                                        )}
                                    </div>

                                    {/* Inventory */}
                                    <div className="datatoko-sidebar-section">
                                        <h4 className="datatoko-section-title">Stok & Inventory</h4>
                                        <StatRow
                                            label="Stok Tersedia"
                                            value={formatNumber(productStats.stock)}
                                            tooltip="Jumlah total stok yang tersedia di semua varian. Stok rendah bisa menandakan produk laris atau masalah supply."
                                        />
                                        <StatRow
                                            label="Inventory Days"
                                            value={
                                                <span style={{ color: productStats.inventoryDays < 30 ? '#ef4444' : productStats.inventoryDays < 90 ? '#f59e0b' : '#10b981' }}>
                                                    {productStats.inventoryDays === 999 ? '∞' : `${productStats.inventoryDays} hari`}
                                                </span>
                                            }
                                            tooltip="Estimasi berapa hari stok akan habis berdasarkan rata-rata penjualan harian. Hijau (>90 hari) = aman, Kuning (30-90) = perlu restock segera, Merah (<30) = stok kritis."
                                        />
                                        <StatRow
                                            label="Penjualan/Hari"
                                            value={`${formatNumber(productStats.dailySold)} pcs`}
                                            tooltip="Rata-rata unit terjual per hari sejak produk pertama kali listing. Berguna untuk perencanaan stok dan proyeksi."
                                        />
                                    </div>

                                    {/* Rating Analysis */}
                                    <div className="datatoko-sidebar-section">
                                        <Tooltip text="Distribusi rating menunjukkan kualitas produk. Produk bagus memiliki 5★ > 90% dan 1-3★ < 5%.">
                                            <h4 className="datatoko-section-title" style={{ cursor: 'help' }}>Rating ({productStats.rating.toFixed(1)})</h4>
                                        </Tooltip>
                                        <div style={{ marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '11px', width: '30px' }}>5★</span>
                                                <div style={{ flex: 1, height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${productStats.rating5Pct}%`, height: '100%', background: '#10b981' }}></div>
                                                </div>
                                                <span style={{ fontSize: '11px', width: '35px', textAlign: 'right' }}>{productStats.rating5Pct}%</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '11px', width: '30px' }}>4★</span>
                                                <div style={{ flex: 1, height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${productStats.rating4Pct}%`, height: '100%', background: '#84cc16' }}></div>
                                                </div>
                                                <span style={{ fontSize: '11px', width: '35px', textAlign: 'right' }}>{productStats.rating4Pct}%</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '11px', width: '30px' }}>1-3★</span>
                                                <div style={{ flex: 1, height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${productStats.ratingBadPct}%`, height: '100%', background: '#ef4444' }}></div>
                                                </div>
                                                <span style={{ fontSize: '11px', width: '35px', textAlign: 'right' }}>{productStats.ratingBadPct}%</span>
                                            </div>
                                        </div>
                                        <StatRow
                                            label="Total Ulasan"
                                            value={formatNumber(productStats.ratingCount)}
                                            tooltip="Jumlah total ulasan yang diberikan pembeli. Lebih banyak ulasan = lebih banyak social proof untuk calon pembeli."
                                        />
                                    </div>

                                    {/* Engagement */}
                                    <div className="datatoko-sidebar-section">
                                        <h4 className="datatoko-section-title">Engagement</h4>
                                        <StatRow
                                            label="Favorit"
                                            value={formatNumber(productStats.likes)}
                                            tooltip="Jumlah user yang menambahkan produk ke wishlist/favorit. Indikator minat terhadap produk tanpa harus membeli."
                                        />
                                        <StatRow
                                            label="Review Rate"
                                            value={`${productStats.reviewRate}%`}
                                            tooltip="Persentase pembeli yang memberikan ulasan setelah membeli. Rate tinggi (>50%) = engagement bagus. Formula: (total ulasan / total terjual) × 100."
                                        />
                                        <StatRow
                                            label="Like Rate"
                                            value={`${productStats.likeRate}%`}
                                            tooltip="Rasio favorit terhadap penjualan. Rate tinggi menunjukkan banyak orang tertarik tapi belum membeli (potensi konversi). Formula: (favorit / total terjual) × 100."
                                        />
                                    </div>

                                    {/* Varian Terlaris with hover-reveal save */}
                                    {productStats.variants.length > 0 && (
                                        <div className="datatoko-sidebar-section">
                                            <h4 className="datatoko-section-title">
                                                <Tooltip text="Ranking varian berdasarkan jumlah penjualan. Hover untuk menyimpan varian ke list.">
                                                    <span style={{ borderBottom: '1px dotted #9ca3af', cursor: 'help' }}>Varian Terlaris ({productStats.variantCount})</span>
                                                </Tooltip>
                                            </h4>
                                            {productStats.variants
                                                .sort((a, b) => b.sold - a.sold)
                                                .slice(0, 5)
                                                .map((v, i, arr) => {
                                                    const maxSold = arr[0]?.sold || 1
                                                    const opacity = v.sold / maxSold
                                                    const bgColor = `rgba(26, 53, 43, ${opacity * 0.25})`
                                                    const isTop = i === 0
                                                    const isAlreadySaved = bookmarks.some(b => b.itemid === productStats.itemid && b.selectedVariantId === v.modelid)

                                                    return (
                                                        <div
                                                            key={v.modelid}
                                                            className="datatoko-variant-row"
                                                            style={{
                                                                position: 'relative',
                                                                overflow: 'hidden',
                                                                margin: '0 -10px',
                                                                borderRadius: '6px',
                                                                borderBottom: i < 4 ? '1px solid rgba(243,244,246,0.5)' : 'none'
                                                            }}
                                                        >
                                                            {/* Add Button (hidden, revealed on hover) */}
                                                            <button
                                                                className="datatoko-variant-add-btn"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    if (isAlreadySaved) {
                                                                        alert('⚠️ Varian ini sudah ada di list')
                                                                        return
                                                                    }

                                                                    const newBookmark: BookmarkedProduct = {
                                                                        itemid: productStats.itemid,
                                                                        shopid: productStats.shopid,
                                                                        name: productStats.name,
                                                                        image: productStats.image,
                                                                        priceMin: v.price,
                                                                        priceMax: v.price,
                                                                        historicalSold: v.sold,
                                                                        monthlySold: Math.round(v.sold / Math.max(productStats.monthsActive, 1)),
                                                                        monthlyRevenue: Math.round((v.sold / Math.max(productStats.monthsActive, 1)) * v.price),
                                                                        rating: productStats.rating,
                                                                        ratingCount: productStats.ratingCount,
                                                                        variants: [v],
                                                                        selectedVariantId: v.modelid,
                                                                        selectedVariantName: v.name,
                                                                        shopName: productStats.shopName,
                                                                        isOfficialShop: productStats.isOfficialShop,
                                                                        bookmarkedAt: Date.now(),
                                                                        url: window.location.href
                                                                    }
                                                                    const newBookmarks = [...bookmarks, newBookmark]
                                                                    setBookmarks(newBookmarks)
                                                                    localStorage.setItem('datatoko_bookmarks', JSON.stringify(newBookmarks))

                                                                    // Toast
                                                                    const toast = document.createElement('div')
                                                                    toast.textContent = `✅ Varian "${v.name}" disimpan!`
                                                                    toast.style.cssText = `
                                                                        position: fixed;
                                                                        top: 20px;
                                                                        left: 50%;
                                                                        transform: translateX(-50%);
                                                                        background: #10b981;
                                                                        color: white;
                                                                        padding: 12px 24px;
                                                                        border-radius: 8px;
                                                                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                                                                        z-index: 10002;
                                                                        font-weight: 500;
                                                                        font-size: 14px;
                                                                    `
                                                                    document.body.appendChild(toast)
                                                                    setTimeout(() => {
                                                                        toast.style.opacity = '0'
                                                                        toast.style.transition = 'opacity 0.3s ease'
                                                                        setTimeout(() => toast.remove(), 300)
                                                                    }, 2000)
                                                                }}
                                                                style={{
                                                                    position: 'absolute',
                                                                    left: 0,
                                                                    top: 0,
                                                                    bottom: 0,
                                                                    width: '36px',
                                                                    background: isAlreadySaved ? '#9ca3af' : '#1A352B',
                                                                    border: 'none',
                                                                    color: 'white',
                                                                    cursor: isAlreadySaved ? 'default' : 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: '16px',
                                                                    opacity: 0,
                                                                    transition: 'opacity 0.2s ease'
                                                                }}
                                                                title={isAlreadySaved ? 'Sudah disimpan' : 'Tambah ke list'}
                                                            >
                                                                {isAlreadySaved ?
                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                                                    </svg>
                                                                    :
                                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" style={{ width: '18px', height: '18px' }}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                                                                    </svg>
                                                                }
                                                            </button>

                                                            {/* Variant Content (slides right on hover) */}
                                                            <div
                                                                className="datatoko-variant-content"
                                                                style={{
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center',
                                                                    padding: '8px 10px',
                                                                    background: bgColor,
                                                                    transition: 'transform 0.2s ease'
                                                                }}
                                                            >
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{
                                                                        fontSize: '12px',
                                                                        fontWeight: isTop ? '600' : '500',
                                                                        color: isTop ? '#1A352B' : '#374151'
                                                                    }}>
                                                                        {v.name}
                                                                    </div>
                                                                    <div style={{ fontSize: '10px', color: '#6b7280' }}>
                                                                        {formatCurrency(v.price)} • Stok: {formatNumber(v.stock)}
                                                                    </div>
                                                                </div>
                                                                <div style={{ textAlign: 'right' }}>
                                                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#1A352B' }}>{formatNumber(v.sold)}</div>
                                                                    <div style={{ fontSize: '10px', color: '#6b7280' }}>terjual</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            }
                                        </div>
                                    )}

                                    {/* Toko */}
                                    <div className="datatoko-sidebar-section">
                                        <h4 className="datatoko-section-title">Info Toko</h4>
                                        <StatRow
                                            label="Toko"
                                            value={
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {productStats.shopName}
                                                    {productStats.isOfficialShop && <span style={{ background: '#1A352B', color: 'white', fontSize: '9px', padding: '2px 4px', borderRadius: '3px' }}>Official</span>}
                                                    {productStats.isPreferredPlus && <span style={{ background: '#f59e0b', color: 'white', fontSize: '9px', padding: '2px 4px', borderRadius: '3px' }}>Star+</span>}
                                                </span>
                                            }
                                            tooltip="Nama toko penjual. Official Store = toko resmi brand. Star+ = seller dengan performa tinggi dan terverifikasi."
                                        />
                                        {productStats.shopLocation && (
                                            <StatRow
                                                label="Lokasi"
                                                value={productStats.shopLocation}
                                                tooltip="Lokasi toko mempengaruhi ongkos kirim dan waktu pengiriman ke pembeli."
                                            />
                                        )}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="datatoko-sidebar-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="datatoko-disclaimer">*Data estimasi</span>
                    <button
                        onClick={() => { loadBookmarks(); setShowBookmarkModal(true) }}
                        style={{
                            padding: '4px 10px',
                            background: '#1A352B',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer'
                        }}
                    >
                        List ({JSON.parse(localStorage.getItem('datatoko_bookmarks') || '[]').length})
                    </button>
                </div>
            </div>

            {/* Bookmark Modal - Refined Green Theme */}
            {showBookmarkModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 10001
                }}>
                    <div style={{
                        background: 'white',
                        borderRadius: '12px',
                        width: '600px',
                        maxWidth: '90vw',
                        maxHeight: '85vh',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '20px 24px',
                            borderBottom: '1px solid #e5e7eb',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: '#ffffff'
                        }}>
                            <div>
                                <div style={{ fontWeight: '700', fontSize: '18px', color: '#1A352B' }}>
                                    Produk Tersimpan
                                </div>
                                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                                    Kelola daftar produk yang Anda simpan
                                </div>
                            </div>
                            <button onClick={() => setShowBookmarkModal(false)} style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#9ca3af',
                                fontSize: '20px',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'color 0.2s',
                            }}>✕</button>
                        </div>

                        {/* Export Buttons */}
                        <div style={{
                            padding: '12px 24px',
                            borderBottom: '1px solid #f3f4f6',
                            display: 'flex',
                            gap: '12px',
                            background: '#fafafa',
                            justifyContent: 'flex-end',
                            alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '12px', color: '#6b7280', marginRight: 'auto' }}>
                                Total: <b>{bookmarks.length}</b> produk
                            </span>
                            {bookmarks.length > 0 && (
                                <>
                                    <button onClick={exportToCSV} style={{
                                        padding: '8px 16px',
                                        background: '#1A352B',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        fontWeight: '500',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}>
                                        <span>Download CSV</span>
                                    </button>
                                    <button onClick={exportToJSON} style={{
                                        padding: '8px 16px',
                                        background: 'white',
                                        color: '#1A352B',
                                        border: '1px solid #1A352B',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        fontWeight: '500',
                                        cursor: 'pointer'
                                    }}> Export JSON</button>
                                </>
                            )}
                        </div>

                        {/* Bookmark List */}
                        <div style={{ flex: 1, overflow: 'auto', padding: '24px', background: '#f9fafb' }}>
                            {bookmarks.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                                    <div style={{ fontWeight: '500', color: '#374151', marginBottom: '4px' }}>Belum ada produk tersimpan</div>
                                    <div style={{ fontSize: '13px' }}>Simpan produk dari sidebar saat browsing di Shopee</div>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: '12px' }}>
                                    {bookmarks.map((b, i) => {
                                        const bestVariant = [...(b.variants || [])].sort((a, v) => v.sold - a.sold)[0]
                                        return (
                                            <div key={b.itemid + '-' + i} style={{
                                                padding: '16px',
                                                borderRadius: '10px',
                                                border: '1px solid #e5e7eb',
                                                background: 'white',
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                                transition: 'all 0.2s',
                                                display: 'flex',
                                                gap: '16px'
                                            }}>
                                                {/* Image */}
                                                <div style={{
                                                    width: '64px',
                                                    height: '64px',
                                                    borderRadius: '6px',
                                                    background: '#f3f4f6',
                                                    flexShrink: 0,
                                                    overflow: 'hidden'
                                                }}>
                                                    {b.image && <img src={`https://down-id.img.susercontent.com/file/${b.image}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                                                </div>

                                                {/* Content */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{
                                                        fontWeight: '600',
                                                        fontSize: '14px',
                                                        color: '#1f2937',
                                                        lineHeight: '1.4',
                                                        display: '-webkit-box',
                                                        WebkitLineClamp: 1,
                                                        WebkitBoxOrient: 'vertical',
                                                        overflow: 'hidden',
                                                        marginBottom: '4px'
                                                    }} title={b.name}>
                                                        {b.name}
                                                    </div>

                                                    <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '8px' }}>
                                                        {formatPrice(b.priceMin)} {b.priceMin !== b.priceMax && `- ${formatPrice(b.priceMax)}`}
                                                    </div>

                                                    {/* Badges/Stats */}
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            background: '#ecfdf5',
                                                            color: '#059669',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontWeight: '500'
                                                        }}>
                                                            {formatNumber(b.historicalSold)} terjual
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                            ★ {b.rating.toFixed(1)}
                                                        </span>
                                                        {b.selectedVariantName ? (
                                                            <span style={{
                                                                fontSize: '11px',
                                                                background: '#f3f4f6',
                                                                color: '#374151',
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                border: '1px solid #e5e7eb'
                                                            }}>
                                                                Varian: {b.selectedVariantName}
                                                            </span>
                                                        ) : bestVariant && (
                                                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                                                                Best: {bestVariant.name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Action Buttons Column */}
                                                <div style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '6px',
                                                    alignSelf: 'center'
                                                }}>
                                                    {/* Lihat Button */}
                                                    <a
                                                        href={`https://shopee.co.id/product/${b.shopid}/${b.itemid}`}
                                                        target="_blank"
                                                        title="Lihat di Shopee"
                                                        style={{
                                                            textDecoration: 'none',
                                                            color: '#1A352B',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            width: '32px',
                                                            height: '32px',
                                                            borderRadius: '6px',
                                                            background: '#f0f7f4',
                                                            transition: 'background 0.2s'
                                                        }}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                                        </svg>
                                                    </a>

                                                    {/* Delete Button */}
                                                    <button
                                                        onClick={() => {
                                                            const newBookmarks = bookmarks.filter((_, idx) => idx !== i)
                                                            setBookmarks(newBookmarks)
                                                            localStorage.setItem('datatoko_bookmarks', JSON.stringify(newBookmarks))
                                                        }}
                                                        style={{
                                                            border: 'none',
                                                            background: '#fef2f2',
                                                            color: '#ef4444',
                                                            cursor: 'pointer',
                                                            width: '32px',
                                                            height: '32px',
                                                            borderRadius: '6px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            transition: 'background 0.2s'
                                                        }}
                                                        title="Hapus"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </>
    )
}

export default DataTokoSidebar
