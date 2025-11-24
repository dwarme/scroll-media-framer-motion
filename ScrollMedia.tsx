import * as React from "react"
import { addPropertyControls, ControlType } from "framer"
import { useMotionValue } from "framer-motion"
// Utility component for displaying a message when content is missing
import { ComponentMessage } from "../ZUtility/Utils.tsx" 

/**
 * @interface MediaRendererProps
 * Defines the props for the basic media (image/video) display component.
 */
interface MediaRendererProps {
    mode: "image" | "video" // Specifies whether to render an image or a video element
    media: string | { src: string } // The media source (string for video, object with src for image)
    currentTime?: number // For videos, the current time to display
    imageFit: "cover" | "contain" // CSS object-fit property
    videoRef?: React.RefObject<HTMLVideoElement> // Ref for accessing the native video element
    display: "block" | "none" // Controls the visibility of the media element
    poster?: string // Video poster image source
    posterEnabled?: boolean // Flag to determine if the poster should be applied
}

/**
 * MediaRenderer component.
 * Renders either an <img> or a <video> based on the 'mode' prop.
 * Used within ScrollMedia to display the appropriate frame/time.
 */
const MediaRenderer = React.memo(
    ({
        mode,
        media,
        currentTime,
        imageFit,
        videoRef,
        display,
        poster,
        posterEnabled,
    }: MediaRendererProps) => {
        // Base styling applied to both image and video elements
        const commonStyle = {
            width: "100%",
            height: "100%",
            objectFit: imageFit,
            position: "absolute" as const, // Ensures media fills the container
            top: 0,
            left: 0,
            display, // Controls visibility based on frame index (for image sequence)
        }

        // Effect to synchronize the video element's currentTime with the scroll-derived currentTime prop
        React.useEffect(() => {
            if (
                mode === "video" &&
                videoRef?.current &&
                currentTime !== undefined
            ) {
                const video = videoRef.current
                // Only update currentTime if the difference is significant (> 0.1s)
                // to avoid unnecessary re-renders or seeking jank.
                if (Math.abs(video.currentTime - currentTime) > 0.1) {
                    video.currentTime = currentTime
                }
            }
        }, [mode, videoRef, currentTime])

        if (mode === "image") {
            // Renders an image element. Note: 'media' is expected to be an object { src: string }
            return (
                <img
                    src={(media as { src: string }).src}
                    style={commonStyle}
                    alt=""
                />
            )
        } else {
            // Renders a video element. Note: 'media' is expected to be a string URL
            return (
                <video
                    ref={videoRef}
                    src={media as string}
                    style={commonStyle}
                    preload="auto"
                    muted // Essential for autoplay and controlling playback via script
                    playsInline
                    poster={posterEnabled ? poster : undefined} // Apply poster if enabled
                />
            )
        }
    }
)

/**
 * @framerIntrinsicWidth 400
 * @framerIntrinsicHeight 200
 *
 * @framerDisableUnlink
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 */

/**
 * ScrollMedia component.
 * Drives an image sequence or video playback based on scroll position.
 */
export default function ScrollMedia({
    mode, // "image" or "video"
    images, // Array of image sources for sequence mode
    video, // Video source URL for video mode
    scrollAreaHeight, // The vertical scroll distance required to complete the animation
    imageFit,
    frameRate = 30, // Frame rate (FPS) to limit video seeking updates
    sequenceStartOffset = 0, // Unused in this version but typically for offsetting the scroll start
    triggerPosition = "text-align-top", // Where in the viewport the component should start animating
    poster,
    posterEnabled,
}) {
    // State to hold media information (preloaded images, video duration, and current time)
    const [mediaState, setMediaState] = React.useState({
        loadedMedia: [], // Stores preloaded Image objects for image sequence
        currentTime: 0, // Current frame index (image) or time in seconds (video)
        videoDuration: 0, // Total duration of the loaded video
        isVideoMetadataLoaded: false, // Flag indicating if video duration is known
    })
    const videoRef = React.useRef<HTMLVideoElement>(null) // Ref for the Video element
    const componentRef = React.useRef<HTMLDivElement>(null) // Ref for the root container
    const scrollY = useMotionValue(0) // Motion value tracking scroll position (for Framer integration/debugging)
    const lastUpdateTime = React.useRef(0) // Timestamp of the last frame update
    // Calculate the minimum time interval between updates based on the frame rate (FPS)
    const frameInterval = React.useMemo(() => 1000 / frameRate, [frameRate]) 
    const startPositionRef = React.useRef<number | null>(null) // The initial scroll position where the animation begins

    // Effect for preloading images when in image sequence mode
    React.useEffect(() => {
        if (mode === "image") {
            const preloadedImages = images.map((src) => {
                const img = new Image()
                img.src = src
                return img // Store the Image object to keep it in memory
            })
            setMediaState((prev) => ({ ...prev, loadedMedia: preloadedImages }))
        } else {
            // Reset media state when switching to video mode
            setMediaState((prev) => ({
                ...prev,
                loadedMedia: [],
                isVideoMetadataLoaded: false,
            }))
        }
    }, [images, mode])

    // Effect for handling video loading and metadata
    React.useEffect(() => {
        if (mode === "video" && videoRef.current) {
            const handleLoadedMetadata = () => {
                // Once metadata is loaded, store the video duration
                setMediaState((prev) => ({
                    ...prev,
                    videoDuration: videoRef.current!.duration,
                    isVideoMetadataLoaded: true,
                }))
            }
            videoRef.current.addEventListener(
                "loadedmetadata",
                handleLoadedMetadata
            )

            // Trigger video load to get metadata
            videoRef.current.load()

            return () => {
                // Clean up the event listener
                videoRef.current?.removeEventListener(
                    "loadedmetadata",
                    handleLoadedMetadata
                )
            }
        }
    }, [mode, video])

    /**
     * Determines the absolute top position of an element, accounting for sticky parents.
     * This is crucial for accurately calculating the scroll start point.
     */
    const getOriginalPosition = (element: HTMLElement): number => {
        // Helper function to find the nearest sticky parent
        const findStickyParent = (el: HTMLElement): HTMLElement | null => {
            let currentElement = el

            while (currentElement && currentElement !== document.body) {
                const position =
                    window.getComputedStyle(currentElement).position
                if (position === "sticky") {
                    return currentElement
                }
                currentElement = currentElement.parentElement as HTMLElement
            }

            return null
        }

        const stickyElement = findStickyParent(element)
        // If a sticky parent exists, use its position; otherwise, use the element itself
        const targetElement = stickyElement || element

        // Temporarily change position to static to get the "true" layout position
        const originalPosition = targetElement.style.position
        targetElement.style.position = "static"

        // Calculate absolute top position (top of viewport + scroll offset)
        const rect = targetElement.getBoundingClientRect()
        const scrollTop =
            window.pageYOffset || document.documentElement.scrollTop
        const top = rect.top + scrollTop

        // Restore original position
        targetElement.style.position = originalPosition

        return top
    }

    /**
     * Calculates the media progress (frame/time) based on the current scroll position.
     * This function is throttled by 'frameInterval' in video mode.
     */
    const updateMediaPosition = React.useCallback(
        (scrollPosition: number) => {
            if (!componentRef.current) return

            const now = performance.now()
            // Throttle updates in video mode to match the set frame rate
            if (
                mode === "video" &&
                now - lastUpdateTime.current < frameInterval
            )
                return

            const rect = componentRef.current.getBoundingClientRect()
            const viewportHeight = window.innerHeight
            const documentHeight = document.documentElement.scrollHeight
            let triggerPoint = 0

            // Determine the vertical position in the viewport that acts as the animation start
            switch (triggerPosition) {
                case "text-align-middle":
                    triggerPoint = viewportHeight / 2
                    break
                case "text-align-bottom":
                    triggerPoint = viewportHeight
                    break
                default: // "text-align-top"
                    triggerPoint = 0
            }

            // Detect when the component hits the trigger point and set the initial scroll position
            if (startPositionRef.current === null && rect.top <= triggerPoint) {
                startPositionRef.current = getOriginalPosition(
                    componentRef.current
                )
            }

            if (startPositionRef.current !== null) {
                // Calculate the distance scrolled since the component hit the trigger point
                const scrollDistance = scrollPosition - startPositionRef.current
                
                // Calculate the effective scrollable area for the animation
                const totalScrollDistance =
                    documentHeight - startPositionRef.current
                const effectiveScrollArea = Math.min(
                    scrollAreaHeight, // Limited by user-defined length
                    totalScrollDistance // Limited by remaining document height
                )
                
                // Calculate progress (0 to 1) within the effective scroll area
                const progress = Math.max(
                    0,
                    Math.min(scrollDistance / effectiveScrollArea, 1)
                )

                if (mode === "image") {
                    // Map progress (0-1) to the image index (0 to length-1)
                    const newIndex = Math.floor(
                        progress * (mediaState.loadedMedia.length - 1)
                    )
                    setMediaState((prev) => ({
                        ...prev,
                        currentTime: Math.min(
                            newIndex,
                            prev.loadedMedia.length - 1
                        ),
                    }))
                } else if (mode === "video" && mediaState.videoDuration > 0) {
                    // Map progress (0-1) to video time (0 to duration)
                    const newTime = progress * mediaState.videoDuration
                    setMediaState((prev) => ({
                        ...prev,
                        currentTime: Math.min(newTime, prev.videoDuration),
                    }))
                }
            }

            lastUpdateTime.current = now
        },
        [
            mode,
            triggerPosition,
            scrollAreaHeight,
            mediaState.loadedMedia.length,
            mediaState.videoDuration,
            frameInterval,
        ]
    )

    // Scroll handler function, debounced using requestAnimationFrame
    const handleScroll = React.useCallback(() => {
        requestAnimationFrame(() => {
            const scrollPosition = window.scrollY
            scrollY.set(scrollPosition) // Update motion value
            updateMediaPosition(scrollPosition) // Calculate and update media position
        })
    }, [scrollY, updateMediaPosition])

    // Effect to set up and tear down the global scroll listener
    React.useEffect(() => {
        window.addEventListener("scroll", handleScroll, { passive: true })
        return () => {
            window.removeEventListener("scroll", handleScroll)
            // Reset start position when component unmounts
            startPositionRef.current = null 
        }
    }, [handleScroll, video])

    // Effect to run the initial calculation once the video metadata is loaded or immediately for images
    React.useEffect(() => {
        const initialScrollPosition = window.scrollY
        if (mode === "video" && mediaState.isVideoMetadataLoaded) {
            // Recalculate if video metadata loads later
            const initialScrollPosition = window.scrollY
            scrollY.set(initialScrollPosition)
            updateMediaPosition(initialScrollPosition)
        }
        if (mode === "image") {
            // Immediate calculation for image sequence
            scrollY.set(initialScrollPosition)
            updateMediaPosition(initialScrollPosition)
        }
    }, [mode, mediaState.isVideoMetadataLoaded, updateMediaPosition])

    // Determines if the component is in an empty state (no media provided)
    const isEmptyState = React.useMemo(() => {
        return (
            (mode === "image" && images.length === 0) ||
            (mode === "video" && !video)
        )
    }, [mode, images, video])

    // Render placeholder message if no media is provided
    if (isEmptyState) {
        return (
            <ComponentMessage
                title="Scroll Media Component"
                subtitle={
                    mode === "video"
                        ? "Upload a video file on the right properties panel."
                        : "Upload your images/video on the right properties panel."
                }
            />
        )
    }

    // Main component render
    return (
        <div
            ref={componentRef}
            style={{ width: "100%", height: "100%", position: "relative" }}
        >
            {mode === "image" ? (
                // Render all images for sequence mode, but only display the active one
                mediaState.loadedMedia.map((img, index) => (
                    <MediaRenderer
                        key={index}
                        mode="image"
                        media={img}
                        imageFit={imageFit}
                        display={
                            // Check if the current image index matches the scroll-derived frame
                            index === Math.floor(mediaState.currentTime)
                                ? "block"
                                : "none"
                        }
                    />
                ))
            ) : (
                // Render a single video element
                <MediaRenderer
                    mode="video"
                    media={video}
                    currentTime={mediaState.currentTime} // Controlled by scroll
                    imageFit={imageFit}
                    videoRef={videoRef}
                    display="block"
                    poster={poster}
                    posterEnabled={posterEnabled}
                />
            )}
        </div>
    )
}

ScrollMedia.displayName = "Scroll Media"

// Define default props for the component
ScrollMedia.defaultProps = {
    mode: "image",
    images: [],
    video: "",
    scrollAreaHeight: 5000,
    imageFit: "cover",
    frameRate: 30,
    sequenceStartOffset: 0,
    triggerPosition: "text-align-top",
    posterEnabled: false,
    poster: "",
}

// Framer property controls for the component UI
addPropertyControls(ScrollMedia, {
    mode: {
        type: ControlType.Enum,
        title: "Mode",
        options: ["image", "video"],
        optionTitles: ["Image", "Video"],
        displaySegmentedControl: true,
        segmentedControlDirection: "vertical",
    },
    images: {
        type: ControlType.Array,
        title: "Images",
        propertyControl: { type: ControlType.Image },
        hidden: ({ mode }) => mode !== "image", // Only show if mode is "image"
    },
    video: {
        type: ControlType.File,
        title: "Video",
        allowedFileTypes: ["mp4"],
        hidden: ({ mode }) => mode !== "video", // Only show if mode is "video"
    },
    imageFit: {
        type: ControlType.Enum,
        title: "Media Fit",
        options: ["cover", "contain"],
        optionTitles: ["Cover", "Contain"],
        displaySegmentedControl: true,
        segmentedControlDirection: "horizontal",
    },
    posterEnabled: {
        type: ControlType.Boolean,
        title: "Poster",
        enabledTitle: "Yes",
        disabledTitle: "No",
        description:
            "I recommend adding a poster. [Learn more](https://framer.com/help/articles/how-are-videos-optimized-in-framer/).",
        hidden: ({ mode }) => mode !== "video",
    },
    poster: {
        type: ControlType.Image,
        title: " ", // Empty title for alignment under posterEnabled
        hidden: ({ mode, posterEnabled }) => mode !== "video" || !posterEnabled, // Only show if video mode and poster is enabled
    },
    triggerPosition: {
        type: ControlType.Enum,
        title: "Start",
        options: ["text-align-top", "text-align-middle", "text-align-bottom"],
        optionTitles: ["Top", "Center", "Bottom"],
        optionIcons: [
            "text-align-top",
            "text-align-middle",
            "text-align-bottom",
        ],
        displaySegmentedControl: true,
        segmentedControlDirection: "horizontal",
    },
    scrollAreaHeight: {
        type: ControlType.Number,
        title: "Length",
        description:
            "Rule of thumb: 500 for each second of the video. So for a 10s video, set length to 5000.",
        min: 10,
        max: 100000,
        step: 100,
    },
    frameRate: {
        type: ControlType.Number,
        title: "FPS",
        min: 1,
        max: 60,
        step: 1,
        hidden: ({ mode }) => mode !== "video", // Only relevant for video throttling
    },
    sequenceStartOffset: {
        type: ControlType.Number,
        title: "Offset",
        min: 0,
        max: 10000,
        step: 100,
        description:
            "More components at [Framer University](https://frameruni.link/cc).",
    },
})
