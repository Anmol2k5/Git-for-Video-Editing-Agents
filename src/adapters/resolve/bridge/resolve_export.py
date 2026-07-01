import sys
import json
import argparse
import hashlib
from resolve_discovery import get_resolve_module

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

def generate_stable_id(track_type, track_index, clip_name, start_frame, end_frame):
    """Generate a deterministic fallback ID for clips."""
    unique_string = f"{track_type}_{track_index}_{clip_name}_{start_frame}_{end_frame}"
    return hashlib.md5(unique_string.encode('utf-8')).hexdigest()

def export_timeline(redact_media_paths=False):
    try:
        dvr_script = get_resolve_module()
    except ImportError as e:
        return {"success": False, "error": str(e), "errorType": "MissingModuleError"}

    resolve = dvr_script.scriptapp("Resolve")
    if not resolve:
        return {"success": False, "error": "DaVinci Resolve is not open.", "errorType": "ResolveNotOpenError"}

    project_manager = resolve.GetProjectManager()
    project = project_manager.GetCurrentProject()
    
    if not project:
        return {"success": False, "error": "No project is open in DaVinci Resolve.", "errorType": "NoProjectOpenError"}

    timeline = project.GetCurrentTimeline()
    if not timeline:
        return {"success": False, "error": "No active timeline found in the current project.", "errorType": "NoActiveTimelineError"}

    resolve_version = resolve.GetVersionString()

    result = {
        "success": True,
        "source": "davinci-resolve-live",
        "resolveVersion": resolve_version,
        "project": {
            "name": project.GetName(),
            "id": project.GetSetting("id") or project.GetName()  # fallback if id setting not available
        },
        "timeline": {
            "id": timeline.GetSetting("id") or timeline.GetName(),
            "name": timeline.GetName(),
            "frameRate": float(timeline.GetSetting("timelineFrameRate")),
            "startFrame": int(timeline.GetStartFrame()),
            "startTimecode": timeline.GetStartTimecode(),
            "durationFrames": 0, # To be calculated based on clips
            "videoTrackCount": timeline.GetTrackCount("video"),
            "audioTrackCount": timeline.GetTrackCount("audio"),
            "subtitleTrackCount": timeline.GetTrackCount("subtitle"),
            "markers": [], # Timeline markers
            "tracks": []
        },
        "warnings": []
    }

    # Grab Timeline Markers
    markers = timeline.GetMarkers()
    if markers:
        for frame_id, marker_data in markers.items():
            result["timeline"]["markers"].append({
                "id": generate_stable_id("marker", 0, marker_data.get("name", ""), frame_id, frame_id),
                "name": marker_data.get("name", ""),
                "color": marker_data.get("color", ""),
                "note": marker_data.get("note", ""),
                "customData": marker_data.get("customData", ""),
                "frameId": int(frame_id)
            })

    track_types = ["video", "audio", "subtitle"]
    max_frame = 0

    for track_type in track_types:
        track_count = timeline.GetTrackCount(track_type)
        for i in range(1, track_count + 1):
            track_name = timeline.GetTrackName(track_type, i)
            
            track_data = {
                "id": f"{track_type}-{i}",
                "type": track_type,
                "index": i,
                "name": track_name,
                "items": []
            }
            
            items = timeline.GetItemListInTrack(track_type, i)
            if items:
                for item in items:
                    name = item.GetName()
                    start = int(item.GetStart())
                    end = int(item.GetEnd())
                    
                    if end > max_frame:
                        max_frame = end

                    media_pool_item = item.GetMediaPoolItem()
                    media_path = None
                    if media_pool_item:
                        media_pool_id = media_pool_item.GetMediaId()
                        if not redact_media_paths:
                            media_path = media_pool_item.GetClipProperty("File Path")

                    clip_data = {
                        "id": generate_stable_id(track_type, i, name, start, end),
                        "name": name,
                        "mediaPoolId": media_pool_id if media_pool_item else None,
                        "mediaPath": media_path,
                        "trackType": track_type,
                        "trackIndex": i,
                        "recordFrameStart": start,
                        "recordFrameEnd": end,
                        "sourceFrameStart": int(item.GetLeftOffset()),
                        "sourceFrameEnd": int(item.GetLeftOffset()) + (end - start),
                        "durationFrames": end - start,
                        "startTimecode": "N/A", # Optional mapping could be added
                        "endTimecode": "N/A",
                        "enabled": True, # GetClipEnabled not directly exposed reliably, assuming true if present
                        "properties": {},
                        "markers": []
                    }
                    
                    # Try extracting more properties if possible (e.g. colors, composite mode)
                    prop_color = item.GetClipColor()
                    if prop_color and prop_color != "None":
                         clip_data["properties"]["color"] = prop_color

                    # Clip Markers
                    clip_markers = item.GetMarkers()
                    if clip_markers:
                        for m_frame, m_data in clip_markers.items():
                             clip_data["markers"].append({
                                 "frameId": int(m_frame),
                                 "name": m_data.get("name", ""),
                                 "color": m_data.get("color", ""),
                                 "note": m_data.get("note", "")
                             })

                    track_data["items"].append(clip_data)

            result["timeline"]["tracks"].append(track_data)

    result["timeline"]["durationFrames"] = max_frame - result["timeline"]["startFrame"]

    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export DaVinci Resolve active timeline metadata.")
    parser.add_argument("--active-timeline", action="store_true", help="Export active timeline")
    parser.add_argument("--redact-media-paths", action="store_true", help="Redact local file paths from output")
    args = parser.parse_args()

    # Note: --active-timeline is default behavior for now

    try:
        output = export_timeline(redact_media_paths=args.redact_media_paths)
        print(json.dumps(output))
    except Exception as e:
        err_out = {
            "success": False,
            "error": f"Internal Bridge Error: {str(e)}",
            "errorType": "InternalError"
        }
        print(json.dumps(err_out))
        sys.exit(1)
