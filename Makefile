.PHONY: test # Run the tests
test:
	@node --test

.PHONY: platforms # Update platforms.json
platforms:
	@node update_list.js > platforms.json

.PHONY: lint # Lint the project
lint: .pre-commit-config.yaml .git/hooks/pre-commit
	@pre-commit run --show-diff-on-failure --color=always --all-files

## .git/hooks/pre-commit: Install the pre-commit hook
.git/hooks/pre-commit:
	@printf "#!/bin/sh\nmake lint\n" > $@
	@chmod +x $@

debian-install-lint:
	@curl -SsLo /tmp/pre-commit.pyz https://github.com/pre-commit/pre-commit/releases/download/v4.6.2/pre-commit-4.6.2.pyz
	@printf "#!/bin/sh\npython3 /tmp/pre-commit.pyz \"\$$@\"\n" > /usr/local/bin/pre-commit
	@chmod +x /usr/local/bin/pre-commit
