export interface Skill {
  name: string;
  description: string;
  execute: (input: string) => Promise<string>;
}

export const dealFileSkill: Skill = {
  name: "dealFile",
  description: "读写文件，列出目录结构",
  execute: async (input: string) => {
    return "处理文件";
  },
};
