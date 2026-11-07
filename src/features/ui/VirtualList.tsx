import { useState, useRef, useCallback, type ReactNode, useEffect } from 'react'

interface VirtualListProps<T> {
  items: T[]
  itemHeight: number
  height: number
  renderItem(item: T, index: number): ReactNode
  onEndReached?(): void
  overscan?: number
  className?: string
}

export function VirtualList<T>({
  items, itemHeight, height, renderItem, onEndReached, overscan = 5, className,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const endCalledRef = useRef(false)

  const totalHeight = items.length * itemHeight
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const visibleCount = Math.ceil(height / itemHeight) + overscan * 2
  const endIndex = Math.min(items.length - 1, startIndex + visibleCount)

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setScrollTop(el.scrollTop)

    // Триггер onEndReached когда до конца осталось 3 элемента
    const nearEnd = el.scrollTop + el.clientHeight >= totalHeight - itemHeight * 3
    if (nearEnd && !endCalledRef.current) {
      endCalledRef.current = true
      onEndReached?.()
    }
    if (!nearEnd) endCalledRef.current = false
  }, [totalHeight, itemHeight, onEndReached])

  useEffect(() => {
    endCalledRef.current = false
  }, [items.length])

  return (
    <div ref={containerRef} style={{ height, overflowY: 'auto' }}
         onScroll={handleScroll} className={`scrollbar-thin ${className ?? ''}`}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: startIndex * itemHeight, width: '100%' }}>
          {items.slice(startIndex, endIndex + 1).map((item, i) => (
            <div key={startIndex + i} style={{ height: itemHeight }}>
              {renderItem(item, startIndex + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
