import PresetListItem from "../components/PresetListItem";
import { presetListData } from "../utils/presetListData";

export default function Index() {
  return (
    <main className="flex justify-center content-center h-screen bg-red-300">
      <div id="presets">
        {presetListData.map((presetList) => (
          <PresetListItem presetId={presetList} />
        ))}
      </div>
    </main>
  );
}
