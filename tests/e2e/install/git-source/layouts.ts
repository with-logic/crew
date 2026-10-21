/** Explicit linked-directory layouts for source discovery boundaries (§9 step 3). */
export const LINKED_LAYOUTS = [
  {
    label: "skills",
    symlinkParent: ".",
    name: "skills",
    target: ".",
    safeSkillParent: ".",
  },
  {
    label: "namespace",
    symlinkParent: "skills",
    name: "group",
    target: ".",
    safeSkillParent: "skills",
  },
  {
    label: "skill",
    symlinkParent: "skills",
    name: "escaped",
    target: "escaped",
    safeSkillParent: "skills",
  },
  {
    label: "namespace-skill",
    symlinkParent: "skills/group",
    name: "escaped",
    target: "escaped",
    safeSkillParent: "skills",
  },
  {
    label: "root-child",
    symlinkParent: ".",
    name: "escaped",
    target: "escaped",
    safeSkillParent: ".",
  },
] as const;
