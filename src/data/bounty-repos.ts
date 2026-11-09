import { CONFIG } from "../config";
import { nameOf, ownerOf } from "../repos";
import { groupBy } from "../utils";

/**
 * Known bounty program repositories, sourced from agentscan.
 * Format: "owner/repo", matched without letter case.
 */
export const BOUNTY_REPOS: readonly string[] = [
	"0106hyh/hammer-and-nail",
	"0106hyh/kickama-manifest-wizard",
	"123a-bcd/nailstorm-bounty-forge-358",
	"123a-bcd/zeroeye",
	"2lll5/TentOfTrials",
	"9904099/hammer-and-nail-bounty",
	"9904099/zeroeye",
	"aLexzzz430/Cognitive-OS",
	"alulaalmi/Apache-APISIX",
	"ANAVHEOBA/PrivacyLayer",
	"Andyyook/zeroeye",
	"aozorayama45/Apache-DolphinScheduler",
	"aozorayama45/Traefik",
	"asyncapi/tck",
	"atharvnaik1/ipaship-audit",
	"auscaster/frantic-board",
	"benglezhenjun/zeroeye",
	"bolivian-peru/marketplace-service-template",
	"caydyan/zeroeye",
	"commaai/opendbc",
	"cuentaprueba244w-dotcom/TentOfTrials",
	"cuentaprueba244w-dotcom/zeroeye",
	"Dasharo/dasharo-issues",
	"davontepowlowsk1i/Apache-Pulsar",
	"davontepowlowsk1i/CockroachDB",
	"davontepowlowsk1i/gofiber-fiber",
	"digitaldesignerjazz/atrium-forum",
	"Dipraise1/Engram",
	"dungkimtran3d/Traefik",
	"elnahomenick123/Gitea",
	"elnahomenick123/Vault",
	"eunseobchoi/NIPS26_A_CV2024",
	"FreezingMoon/AncientBeast",
	"hunki1488-a11y/AIgor",
	"illbnm/homelab-stack",
	"INDIGOAZUL/la-tanda-web",
	"jackjin1997/TentOfTrials",
	"jackjin1997/zeroeye",
	"jaxassistant55/TentOfTrials",
	"Jennycruzy/sovereign-genesis",
	"jeromyritchie52/Apache-ZooKeeper",
	"jhosepm352-design/oabp-langchain-tool",
	"juanitahagenes/ClickHouse",
	"kcolbchain/arka",
	"killernova/zeroeye",
	"lakhman108/zeroeye",
	"lily-protocol/lily-backend",
	"lobster-trap/Kickama",
	"lobster-trap/SmartGesture",
	"maitebloger111/Apache-Arrow",
	"manav8498/TentOfTrials",
	"mergeos-bounties/mergeos",
	"midnightntwrk/contributor-hub",
	"moorcheh-ai/memanto",
	"Paratii-Video/paratii-js",
	"Paratii-Video/paratii-mediaplayer",
	"Paratii-Video/paratii-portal",
	"pci-tamper-protect/e-skimming-labs",
	"Peter7896/TentOfTrials",
	"Peter7896/zeroeye",
	"priyanshudumps/fuel-agent-kit",
	"promptpolish-ai/git-context",
	"quachminh11/VictoriaMetrics",
	"relayhop/sn-monetization-runtime",
	"remotion-dev/remotion",
	"renaudgenard/TentOfTrials",
	"renaudgenard/zeroeye",
	"Reqrefusion/FreeCAD-Documentation-Project",
	"rodrickparker11/TiKV",
	"runxhq/runx",
	"Scottcjn/bottube",
	"Scottcjn/Rustchain",
	"Scottcjn/rustchain-bounties",
	"Scottcjn/rustchain-dialup",
	"Scottcjn/vintage-voice",
	"SecureBananaLabs/bug-bounty",
	"shaiananvari8/zeroeye",
	"skndash96/bountic",
	"SnowfallHD/TentOfTrials",
	"SnowfallHD/zeroeye",
	"Soengkit/frailbox-checkpoint",
	"Soengkit/zeroeye",
	"Soengkit/zeroeye-killernova",
	"SolFoundry/solfoundry",
	"SPLURT-Station/S.P.L.U.R.T-tg",
	"tari-project/minotari-cli",
	"tari-project/tari",
	"tari-project/universe",
	"tari-project/wallet-benchmarks",
	"tari-project/wxtm-bridge-frontend",
	"TauCetiStation/TauCetiClassic",
	"tenstorrent/tt-llk",
	"tenstorrent/tt-metal",
	"thanhle74/kickama",
	"thanhle74/TentOfTrials",
	"thaohuynh14zc/GORM",
	"thaohuynh14zc/spf13-cobra",
	"thaohuynh14zc/urfave-cli",
	"Thecesar85/TentOfTrials-bounty-67",
	"vedanshjainvj/Job-Hive",
	"victorjones6awpg/Casbin",
	"warpspeedopen-source/warpspeed-bounties",
	"watney-ai/open-source-bounties",
	"waxeye7/screeps-bounty-arena",
	"weilixiong/TentOfTrials",
	"weilixiong/zeroeye",
	"wulansari999/Kickama-Wulansari-Bounty",
	"xevrion-v2/agent-playground",
	"xxnjms1-code/kickama-prize-lab",
	"UnsafeLabs/Bounty-Hunters", // known honeypot repository
	"charles-openclaw/charles-microbounties",
] as const;

const BOUNTY_REPO_PATHS: ReadonlySet<string> = new Set(
	BOUNTY_REPOS.map((repo) => repo.toLowerCase()),
);

/**
 * Bounty campaigns copy the same repository under many throwaway accounts,
 * like "zeroeye". Once a name shows up under several owners in the list, any
 * repository with that name counts, so a new copy is caught before it is
 * listed.
 *
 * Names seen under fewer owners only count with their owner. Campaigns also
 * copy the names of real projects ("Vault", "Gitea", "Traefik"), and matching
 * those by name alone would flag everyone who contributes to the real project.
 */
function campaignNamesOf(paths: Iterable<string>): ReadonlySet<string> {
	const pathsByName = groupBy(paths, (path) => nameOf(path));
	const campaignNames = new Set<string>();

	for (const [name, namePaths] of pathsByName) {
		const owners = new Set(namePaths.map(ownerOf));
		if (name && owners.size >= CONFIG.BOUNTY_CAMPAIGN_MIN_OWNERS) {
			campaignNames.add(name);
		}
	}

	return campaignNames;
}

const BOUNTY_CAMPAIGN_NAMES = campaignNamesOf(BOUNTY_REPO_PATHS);

/** True when activity in this repository counts as bounty program activity. */
export function isBountyRepo(repo: string): boolean {
	const lower = repo.toLowerCase();
	if (BOUNTY_REPO_PATHS.has(lower)) {
		return true;
	}

	const name = nameOf(lower);

	return name !== undefined && BOUNTY_CAMPAIGN_NAMES.has(name);
}
