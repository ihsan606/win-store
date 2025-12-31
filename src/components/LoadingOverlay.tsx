import React from 'react'

interface LoadingOverlayProps {
    isVisible: boolean
    currentPage: number
    capturedProducts: number
    totalExpected: number
    isComplete: boolean
    isPaused?: boolean
    onScrollToTop: () => void
    onClose: () => void
    onStop: () => void
    onContinue?: () => void
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
    isVisible,
    currentPage,
    capturedProducts,
    totalExpected,
    isComplete,
    isPaused = false,
    onScrollToTop,
    onClose,
    onStop,
    onContinue
}) => {
    if (!isVisible) return null

    const progress = totalExpected > 0 ? Math.min((capturedProducts / totalExpected) * 100, 100) : 0

    return (
        <div className="datatoko-loading-overlay">
            <div className="datatoko-loading-modal">
                {isPaused ? (
                    <>
                        <div className="datatoko-loading-header datatoko-loading-paused">
                            <div className="datatoko-loading-pause-icon">⏸️</div>
                            <h3>Dijeda di Halaman {currentPage}</h3>
                        </div>

                        <div className="datatoko-loading-content">
                            <div className="datatoko-loading-stats">
                                <div className="datatoko-loading-stat">
                                    <span className="datatoko-loading-stat-value">{currentPage}</span>
                                    <span className="datatoko-loading-stat-label">Halaman</span>
                                </div>
                                <div className="datatoko-loading-stat">
                                    <span className="datatoko-loading-stat-value">{capturedProducts}</span>
                                    <span className="datatoko-loading-stat-label">Produk</span>
                                </div>
                                <div className="datatoko-loading-stat">
                                    <span className="datatoko-loading-stat-value">{totalExpected || '?'}</span>
                                    <span className="datatoko-loading-stat-label">Total</span>
                                </div>
                            </div>

                            <p className="datatoko-loading-hint">
                                Lanjutkan untuk mengambil lebih banyak produk?
                            </p>
                        </div>

                        <div className="datatoko-loading-actions">
                            <button
                                className="datatoko-loading-btn datatoko-loading-btn-primary"
                                onClick={onContinue}
                            >
                                Lanjutkan
                            </button>
                            <button
                                className="datatoko-loading-btn datatoko-loading-btn-secondary"
                                onClick={() => {
                                    onScrollToTop()
                                    onClose()
                                }}
                            >
                                Cukup, Lihat Statistik
                            </button>
                        </div>
                    </>
                ) : !isComplete ? (
                    <>
                        <div className="datatoko-loading-header">
                            <div className="datatoko-loading-spinner"></div>
                            <h3>Mengambil Data Produk</h3>
                        </div>

                        <div className="datatoko-loading-content">
                            <div className="datatoko-loading-progress-bar">
                                <div
                                    className="datatoko-loading-progress-fill"
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>

                            <div className="datatoko-loading-stats">
                                <div className="datatoko-loading-stat">
                                    <span className="datatoko-loading-stat-value">{currentPage}</span>
                                    <span className="datatoko-loading-stat-label">Halaman</span>
                                </div>
                                <div className="datatoko-loading-stat">
                                    <span className="datatoko-loading-stat-value">{capturedProducts}</span>
                                    <span className="datatoko-loading-stat-label">Produk</span>
                                </div>
                                <div className="datatoko-loading-stat">
                                    <span className="datatoko-loading-stat-value">{totalExpected || '?'}</span>
                                    <span className="datatoko-loading-stat-label">Total</span>
                                </div>
                            </div>

                            <p className="datatoko-loading-hint">
                                Proses sedang berjalan, jangan tutup halaman ini...
                            </p>
                        </div>

                        <div className="datatoko-loading-actions">
                            <button
                                className="datatoko-loading-btn datatoko-loading-btn-stop"
                                onClick={onStop}
                            >
                                Hentikan
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="datatoko-loading-header datatoko-loading-complete">
                            <div className="datatoko-loading-checkmark">✓</div>
                            <h3>Selesai!</h3>
                        </div>

                        <div className="datatoko-loading-content">
                            <div className="datatoko-loading-summary">
                                <span className="datatoko-loading-summary-number">{capturedProducts}</span>
                                <span className="datatoko-loading-summary-text">produk berhasil dikumpulkan</span>
                            </div>
                        </div>

                        <div className="datatoko-loading-actions">
                            <button
                                className="datatoko-loading-btn datatoko-loading-btn-primary"
                                onClick={() => {
                                    onScrollToTop()
                                    onClose()
                                }}
                            >
                                Lihat Statistik
                            </button>
                            <button
                                className="datatoko-loading-btn datatoko-loading-btn-secondary"
                                onClick={onClose}
                            >
                                Tutup
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
