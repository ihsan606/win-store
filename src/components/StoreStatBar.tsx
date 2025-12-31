import iconUrl from "data-base64:~/assets/icon.png"


interface StoreStats {
    products: string | number
    joined: string
    totalSold: string | number
    revenue: string | number
    revenueRaw?: number
    followerCount?: string | number
    rating?: number
    avgRevenue?: string | number
    avgRevenueRaw?: number
    responseRate?: number
    responseTime?: number
    isOfficialShop?: boolean
    totalRatings?: number
    capturedProducts?: number
    totalExpected?: number
    isScrolling?: boolean
}

interface Props {
    stats: StoreStats
    onAnalyze: () => void
    onLoadAll?: () => void
}

export const StoreStatBar = ({ stats, onAnalyze, onLoadAll }: Props) => {
    const formatResponseTime = (seconds: number) => {
        if (!seconds) return "-"
        if (seconds < 60) return `${seconds} dtk`
        if (seconds < 3600) return `${Math.round(seconds / 60)} mnt`
        return `${Math.round(seconds / 3600)} jam`
    }

    const formatRatingCount = (count: number) => {
        if (!count) return ""
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}JT`
        if (count >= 1000) return `${(count / 1000).toFixed(1)}RB`
        return count.toString()
    }

    const formatFullCurrency = (amount: number) => {
        return new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount)
    }

    return (
        <div className="datatoko-panel">
            {/* Header */}
            <div className="datatoko-header">
                <div className="datatoko-brand">
                    <div className="datatoko-logo">
                        <span className="datatoko-fab-icon">
                            <img src={iconUrl} alt="DataToko" />
                        </span>
                    </div>
                    <span className="datatoko-name">DataToko</span>
                    {stats.isOfficialShop && (
                        <span className="datatoko-badge">Official</span>
                    )}
                </div>
                <div className="datatoko-meta">
                    {stats.isScrolling ? (
                        <span className="datatoko-fetching">
                            Auto-scroll {stats.capturedProducts || 0}/{stats.totalExpected || '?'}...
                        </span>
                    ) : stats.capturedProducts ? (
                        <span className="datatoko-captured">
                            {stats.capturedProducts}{stats.totalExpected ? `/${stats.totalExpected}` : ''} produk
                        </span>
                    ) : (
                        <span className="datatoko-update">
                            Scroll halaman untuk capture produk
                        </span>
                    )}
                    {!stats.isScrolling && stats.capturedProducts && stats.capturedProducts < (stats.totalExpected || 999) && (
                        <button className="datatoko-load-btn" onClick={onLoadAll}>
                            Load Halaman
                        </button>
                    )}
                    {stats.isScrolling && (
                        <button className="datatoko-stop-btn" onClick={onLoadAll}>
                            Stop
                        </button>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="datatoko-stats">
                <div className="datatoko-stat">
                    <div className="datatoko-stat-value">{stats.joined}</div>
                    <div className="datatoko-stat-label">Bergabung</div>
                </div>

                <div className="datatoko-divider"></div>

                <div className="datatoko-stat">
                    <div className="datatoko-stat-value">{stats.products}</div>
                    <div className="datatoko-stat-label">Produk</div>
                </div>

                <div className="datatoko-divider"></div>

                <div className="datatoko-stat">
                    <div className="datatoko-stat-value">{stats.followerCount || "-"}</div>
                    <div className="datatoko-stat-label">Follower</div>
                </div>

                <div className="datatoko-divider"></div>

                <div className="datatoko-stat">
                    <div className="datatoko-stat-value rating">
                        {stats.rating?.toFixed(1) || "-"}
                    </div>
                    <div className="datatoko-stat-label">
                        Rating {stats.totalRatings ? `(${formatRatingCount(stats.totalRatings)})` : ""}
                    </div>
                </div>

                <div className="datatoko-divider"></div>

                <div className="datatoko-stat">
                    <div className={`datatoko-stat-value ${stats.responseRate && stats.responseRate >= 90 ? 'success' : ''}`}>
                        {stats.responseRate || 0}%
                    </div>
                    <div className="datatoko-stat-label">Chat ({formatResponseTime(stats.responseTime || 0)})</div>
                </div>

                <div className="datatoko-divider"></div>

                <div className="datatoko-stat">
                    <div className="datatoko-stat-value">{stats.totalSold || "-"}</div>
                    <div className="datatoko-stat-label">Terjual</div>
                </div>

                <div className="datatoko-divider"></div>

                {/* Total Omset with Tooltip */}
                <div className="datatoko-stat highlight datatoko-tooltip-container">
                    <div className="datatoko-stat-value main">{stats.revenue}</div>
                    <div className="datatoko-stat-label">Total Omset</div>
                    {stats.revenueRaw && stats.revenueRaw > 0 && (
                        <div className="datatoko-tooltip">
                            <div className="datatoko-tooltip-title">Total Omset</div>
                            <div className="datatoko-tooltip-value">{formatFullCurrency(stats.revenueRaw)}</div>
                            <div className="datatoko-tooltip-note">Estimasi berdasarkan produk yang ter-capture</div>
                        </div>
                    )}
                </div>

                <div className="datatoko-divider"></div>

                {/* Omset/Bulan with Tooltip */}
                <div className="datatoko-stat datatoko-tooltip-container">
                    <div className="datatoko-stat-value">{stats.avgRevenue || "-"}</div>
                    <div className="datatoko-stat-label">Omset/Bulan</div>
                    {stats.avgRevenueRaw && stats.avgRevenueRaw > 0 && (
                        <div className="datatoko-tooltip">
                            <div className="datatoko-tooltip-title">Omset per Bulan</div>
                            <div className="datatoko-tooltip-value">{formatFullCurrency(stats.avgRevenueRaw)}</div>
                            <div className="datatoko-tooltip-note">Rata-rata sejak toko bergabung</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Action Button - Bottom */}
            <div className="datatoko-footer">
                <button className="datatoko-analyze-btn" onClick={onAnalyze}>
                    Analisa Produk
                </button>
            </div>
        </div>
    )
}
