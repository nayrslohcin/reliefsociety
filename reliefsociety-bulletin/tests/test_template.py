"""Checks that the template, deploy script, policy and site files agree with each other.

These read the files as text, so they need nothing installed. CI also runs
cfn-lint, which checks the template against AWS's own resource schemas.
"""

import json
import re
import shutil
import subprocess
import unittest

from harness import ROOT, TEMPLATE, lambda_source

DEPLOY_SH = ROOT / "deploy.sh"
POLICY = ROOT / "deploy-policy.json"
S3_FILES = ROOT / "s3-files"


def template_text():
    return TEMPLATE.read_text(encoding="utf-8")


def top_level_block(name):
    """Lines of a top-level template section such as Parameters:."""
    lines = template_text().splitlines()
    start = lines.index(f"{name}:") + 1
    block = []
    for line in lines[start:]:
        if line and not line[0].isspace() and not line.startswith("#"):
            break
        block.append(line)
    return block


def template_parameters():
    """{name: has a Default} for each template parameter."""
    params, current = {}, None
    for line in top_level_block("Parameters"):
        m = re.match(r"^  (\w+):\s*$", line)
        if m:
            current = m.group(1)
            params[current] = False
        elif current and re.match(r"^    Default:", line):
            params[current] = True
    return params


def lambda_environment():
    """Variable names set under the Lambda's Environment: Variables:."""
    lines = template_text().splitlines()
    function = lines.index("  EmailPdfProcessorFunction:")
    start = next(i for i in range(function, len(lines)) if lines[i].strip() == "Variables:")
    indent = " " * (len(lines[start]) - len(lines[start].lstrip()) + 2)
    names = []
    for line in lines[start + 1:]:
        m = re.match(rf"^{indent}(\w+):", line)
        if not m:
            break
        names.append(m.group(1))
    return names


def deploy_overrides():
    """Parameter names deploy.sh passes in --parameter-overrides."""
    overrides = DEPLOY_SH.read_text(encoding="utf-8").split("--parameter-overrides", 1)[1]
    return re.findall(r"^\s+(\w+)=", overrides.split("\n\n", 1)[0], re.M)


def policy_actions():
    actions = set()
    for statement in json.loads(POLICY.read_text(encoding="utf-8"))["Statement"]:
        acts = statement["Action"]
        actions.update([acts] if isinstance(acts, str) else acts)
    return actions


class LambdaConfigTests(unittest.TestCase):

    def test_every_variable_the_code_reads_is_set_by_the_template(self):
        read = set(re.findall(r'os\.environ(?:\.get\(|\[)"(\w+)"', lambda_source()))
        self.assertTrue(read, "found no environment variables in the Lambda code")
        self.assertEqual(read - set(lambda_environment()), set())

    def test_deploy_script_reads_variables_the_template_sets(self):
        read = set(re.findall(r"get_var (\w+)", DEPLOY_SH.read_text(encoding="utf-8")))
        self.assertEqual(read - set(lambda_environment()), set())

    def test_lambda_runtime_is_python(self):
        self.assertRegex(template_text(), r"Runtime: python3\.\d+")


class DeployScriptTests(unittest.TestCase):

    def test_overrides_are_all_real_parameters(self):
        self.assertEqual(set(deploy_overrides()) - set(template_parameters()), set())

    def test_every_parameter_without_a_default_is_passed(self):
        required = {name for name, has_default in template_parameters().items() if not has_default}
        self.assertEqual(required - set(deploy_overrides()), set())

    def test_name_servers_ready_is_a_valid_value(self):
        m = re.search(r"NameserversReady=(\S+)", DEPLOY_SH.read_text(encoding="utf-8"))
        self.assertIn(m.group(1), ("true", "false"))

    @unittest.skipUnless(shutil.which("bash"), "bash not installed")
    def test_deploy_script_has_valid_bash_syntax(self):
        result = subprocess.run(["bash", "-n", str(DEPLOY_SH)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


class ReceiptRuleTests(unittest.TestCase):

    def test_every_receipt_rule_scans_mail(self):
        # The Lambda's sender checks rely on SES's verdicts, which ScanEnabled turns on.
        rules = re.split(r"Type: AWS::SES::ReceiptRule\n", template_text())[1:]
        self.assertTrue(rules, "found no receipt rules")
        for rule in rules:
            rule = rule.split("\n  # ──")[0]
            self.assertIn("ScanEnabled: true", rule)


class SiteFileTests(unittest.TestCase):

    def test_cloudfront_error_pages_exist_in_s3_files(self):
        pages = re.findall(r"ResponsePagePath: /(\S+)", template_text())
        self.assertTrue(pages, "found no CloudFront error pages")
        for page in pages:
            self.assertTrue((S3_FILES / page).is_file(), f"s3-files/{page} is missing")

    def test_robots_txt_blocks_crawlers(self):
        self.assertIn("Disallow: /", (S3_FILES / "robots.txt").read_text(encoding="utf-8"))


class DeployPolicyTests(unittest.TestCase):

    def test_policy_is_valid_json_with_complete_statements(self):
        doc = json.loads(POLICY.read_text(encoding="utf-8"))
        self.assertEqual(doc["Version"], "2012-10-17")
        for statement in doc["Statement"]:
            with self.subTest(sid=statement.get("Sid")):
                self.assertIn(statement["Effect"], ("Allow", "Deny"))
                self.assertIn("Action", statement)
                self.assertIn("Resource", statement)

    def test_statement_ids_are_unique(self):
        sids = [s.get("Sid") for s in json.loads(POLICY.read_text(encoding="utf-8"))["Statement"]]
        self.assertEqual(len(sids), len(set(sids)))

    def test_route53_permissions_cloudformation_needs(self):
        # Reading the hosted zone's NameServers also lists its tags; without this
        # permission the deploy fails and rolls back.
        needed = {"route53:GetHostedZone", "route53:ListTagsForResource",
                  "route53:ChangeResourceRecordSets", "route53:GetChange"}
        self.assertEqual(needed - policy_actions(), set())


if __name__ == "__main__":
    unittest.main()
